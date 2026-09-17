import { expect, test } from 'bun:test';
import { inlineMarkdown, serializeMarkdown } from './serialize';
import { sameMarkdownMeaning } from './markdown';

test('literal Markdown typed into Blok remains literal, while supported inline formatting survives', () => {
  expect(sameMarkdownMeaning(inlineMarkdown('Literal *stars* and [link](target) &amp;copy;'), 'Literal \\*stars\\* and \\[link\\](target) &amp;copy;')).toBe(true);
  expect(sameMarkdownMeaning(inlineMarkdown('<strong>Bold</strong> <em>italic</em> <a href="/guide">guide</a>'), '**Bold** *italic* [guide](/guide)')).toBe(true);
  expect(inlineMarkdown('<code>a`b</code>')).toBe('``a`b``');
});

test('code preserves HTML, entities, and embedded fences without interpretation', () => {
  const code = '<div>&copy;</div>\n```\nend';
  const markdown = serializeMarkdown({ blocks: [{ type: 'code', data: { code, language: 'html' } }] });
  expect(markdown).toBe('````html\n' + code + '\n````');
});

test('nested lists and ordered starts remain represented', () => {
  const markdown = serializeMarkdown({ blocks: [
    { type: 'list', data: { text: 'First', style: 'ordered', start: 3 } },
    { type: 'list', data: { text: 'Child', style: 'unordered', depth: 1 } }
  ] });
  expect(sameMarkdownMeaning(markdown, '3. First\n    - Child')).toBe(true);
});
