import { describe, expect, test } from 'bun:test';
import { markdownService, documentUrl, renderSource } from './index';
import { normalizeLanguage } from '../../shared/highlighting';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import type { Root, RootContent } from 'hast';
function textOf(node: Root | RootContent): string {
  return node.type === 'text' ? node.value : 'children' in node ? node.children.map(textOf).join('') : '';
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
