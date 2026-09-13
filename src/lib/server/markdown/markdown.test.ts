import { describe, expect, test } from 'bun:test';
import { markdownService, documentUrl, renderSource } from './index';
import { normalizeLanguage } from '../../shared/highlighting';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import type { Element, Root, RootContent } from 'hast';
import MarkdownIt from 'markdown-it';
import { mermaidPlugin } from './mermaid';
function textOf(node: Root | RootContent): string {
  return node.type === 'text' ? node.value : 'children' in node ? node.children.map(textOf).join('') : '';
}
function elementsOf(node: Root | RootContent): Element[] {
  return [
    ...(node.type === 'element' ? [node] : []),
    ...('children' in node ? node.children.flatMap(elementsOf) : [])
  ];
}
async function render(source: string) {
  const result = await markdownService.render(source, 'guide/README.md');
  if (result.status !== 'ok') throw new Error(result.status);
  return result.value.html;
}
describe('Markdown rendering', () => {
  test('renders core syntax and stable duplicate heading IDs', async () => {
    const html = await render('# Heading\n\n# Heading\n\n**bold** *italic* ~~gone~~ `inline`\n\n> quote\n\n- item\n\n1. ordered\n\n---\n\n| Name | Value |\n| --- | --- |\n| a | b |');
    for (const token of ['id="user-content-heading"', 'id="user-content-heading-1"', '<strong>', '<em>', '<s>', '<code>', '<blockquote>', '<ul>', '<ol>', '<hr>', '<table>']) expect(html).toContain(token);
  });
  test('rewrites Markdown and HTML URLs, preserving queries and encoded paths', async () => {
    const html = await render('[setup](../setup.md?x=1#install)\n\n![Image](../images/a%20b.png)\n\n<a href="/other.md#title">other</a><img src="pic.jpg"><details open><summary>More</summary>Details</details>');
    for (const token of ['/setup.md?x=1#user-content-install', '/_/assets/images/a%20b.png', '/other.md#user-content-title', '/_/assets/guide/pic.jpg', '<details open>', '<summary>']) expect(html).toContain(token);
  });
  test('removes active HTML, author styles, unsafe URLs and clobbering names', async () => {
    const html = await render('<script>alert(1)</script>\n\n<img src="javascript:alert(1)" onerror="bad()" style="position:fixed"><a href="data:text/html,bad">bad</a><iframe src="https://example.com"></iframe><p id="location" style="color:red">ok</p>');
    for (const token of ['<script', 'onerror', 'position:', 'javascript:', 'data:text', '<iframe', 'style=', 'id="location"']) expect(html).not.toContain(token);
    expect(html).toContain('id="user-content-location"');
  });
  test('highlights known fences after sanitization with the dark theme', async () => {
    const html = await render('```bash\necho "hello"\n```');
    expect(html).toContain('shiki');
    expect(html).toContain('shiki github-dark');
    expect(html).not.toContain('github-light');
    expect(html).not.toContain('--shiki-');
    expect(html).toContain('<span');
  });
  test('Mermaid placeholders survive sanitization without highlighting or losing literal source', async () => {
    const source = '\nflowchart TD\n\tA["<script>bad()</script> & &lt;literal&gt;"] --> B\n\n';
    const html = await render('```mermaid\n' + source + '```');
    const elements = elementsOf(unified().use(rehypeParse, { fragment: true }).parse(html));
    const block = elements.find((node) => node.properties.className?.toString() === 'mermaid-block');
    expect(block).toBeDefined();
    expect(block!.children).toHaveLength(1);
    expect(textOf(block!)).toBe(source);
    expect(elements.map((node) => node.tagName)).toEqual(['div', 'pre', 'span']);
    expect(html).not.toContain('shiki');
    expect(html).not.toContain('<script');
  });
  test('recognizes only the exact first Mermaid language token and preserves ordinary fences', async () => {
    const html = await render([
      '```mermaid title=example\nflowchart TD\nA --> B\n```',
      '~~~mermaid\nsequenceDiagram\nAlice->>Bob: Hello\n~~~',
      '```mermaid\n```',
      '```Mermaid\ncase-sensitive\n```',
      '```mermaid-extra\nunknown language\n```',
      '```js\nconst answer = 42;\n```',
      '`mermaid`',
      '    mermaid\n    literal indented code'
    ].join('\n\n'));
    expect(html.match(/class="mermaid-block"/g)).toHaveLength(3);
    expect(html.match(/shiki github-dark/g)).toHaveLength(4);
    expect(html).toContain('<code>mermaid</code>');
    expect(html).toContain('case-sensitive');
    expect(html).toContain('unknown language');
  });
  test('Mermaid plugin delegates other fences to an existing custom renderer', () => {
    const parser = new MarkdownIt();
    parser.renderer.rules.fence = (tokens, index) => `custom:${tokens[index].content}`;
    parser.use(mermaidPlugin);
    expect(parser.render('```js\nexample\n```')).toBe('custom:example\n');
    expect(parser.render('```mermaid\nflowchart TD\n```')).toContain('class="mermaid-block"');
  });
  test('Mermaid class allowance does not admit author styles, SVGs, or arbitrary classes', async () => {
    const html = await render('<div class="mermaid-block malicious" style="color:red" onclick="bad()"><pre>literal</pre><svg onload="bad()"><path /></svg></div>');
    expect(html).toContain('class="mermaid-block"');
    for (const token of ['malicious', 'style=', 'onclick', '<svg', '<path', 'onload']) expect(html).not.toContain(token);
  });
  test('unknown fences and source files preserve literal contents', async () => {
    const content = '<script>danger()</script>\n\t  exact & spacing\n';
    for (const html of [await render('```unknown\n' + content + '```'), (await renderSource(content, 'script.sh', 'bash')).html]) {
      expect(html).not.toContain('<script>');
      expect(textOf(unified().use(rehypeParse, { fragment: true }).parse(html)).trimEnd()).toBe(content.trimEnd());
    }
  });
  test('inline and indented code remain literal', async () => {
    const html = await render('`<img>`\n\n    <script>example</script>\n');
    expect(textOf(unified().use(rehypeParse, { fragment: true }).parse(html))).toContain('<img>');
    expect(html).not.toContain('<script>');
  });
  test('preserves table alignment and prefixed author anchors', async () => {
    const html = await render('| Left | Right |\n| :--- | ---: |\n| a | b |\n\n<a id="user-content-example"></a>[jump](#user-content-example)');
    expect(html).toContain('align="left"');
    expect(html).toContain('align="right"');
    expect(html).toContain('id="user-content-user-content-example"');
    expect(html).toContain('href="#user-content-user-content-example"');
  });
  test('heading prefixes do not collapse distinct slugs', async () => {
    const html = await render('# Example\n\n# User content example\n\n[second](#user-content-example)');
    expect(html).toContain('id="user-content-example"');
    expect(html).toContain('id="user-content-user-content-example"');
    expect(html).toContain('href="#user-content-user-content-example"');
  });
  test('source rendering retains trailing newlines and tabs exactly', async () => {
    const source = 'echo hello\n\t# comment\n\n';
    const { html } = await renderSource(source, 'script.sh', 'sh');
    expect(textOf(unified().use(rehypeParse, { fragment: true }).parse(html))).toBe(source);
  });
});
test.each([
  ['../setup.md#install', '/setup.md#user-content-install'],
  ['#install', '#user-content-install'],
  ['/root.md?x=1', '/root.md?x=1'],
  ['https://example.com/a#b', 'https://example.com/a#b'],
  ['mailto:test@example.com', 'mailto:test@example.com'],
  ['//example.com/image.png', '//example.com/image.png'],
  ['javascript:alert(1)', undefined],
  ['data:text/html,bad', undefined]
])('URL %s', (input, output) => expect(documentUrl(input!, 'guide/README.md')).toBe(output));
test('language aliases and unknown names', () => {
  for (const name of ['sh', 'bash', 'bash_profile']) expect(normalizeLanguage(name)).toBe('shellscript');
  expect(normalizeLanguage('systemd')).toBe('ini');
  for (const name of ['', 'unknown', '__proto__', 'constructor']) expect(normalizeLanguage(name)).toBe('text');
});
