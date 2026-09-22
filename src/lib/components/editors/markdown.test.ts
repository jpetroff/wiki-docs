import { expect, test } from 'bun:test';
import { splitFrontmatter, supportsVisualMarkdown, sameMarkdownMeaning, restoreMarkdown } from './markdown';

test('preserves frontmatter, CRLF, and unchanged Markdown bytes', () => {
  const source = '\uFEFF---\r\ntitle: "Exact"\r\n---\r\n# Hello\r\n';
  expect(splitFrontmatter(source).body).toBe('# Hello\r\n');
  expect(restoreMarkdown(source, '# Hello', '# Hello')).toBe(source);
  expect(restoreMarkdown(source, '# Edited', '# Hello')).toBe('\uFEFF---\r\ntitle: "Exact"\r\n---\r\n# Edited\r\n');
});

test('unsupported HTML, images, nested tables and reference definitions require source mode', () => {
  for (const source of ['<details>Keep me</details>', 'A <span>word</span>', '![Image](test.png)', '> | A |\n> | --- |\n> | 1 |', '- item\n\n  | A |\n  | --- |\n  | 1 |', '| A |\n| --- |\n| <br> |', '[unused]: /target']) {
    expect(supportsVisualMarkdown(source)).toBe(false);
  }
  expect(supportsVisualMarkdown('# Heading\n\n**Bold** and `code`\n\n- item\n\n```sh\necho hello\n```')).toBe(true);
  expect(supportsVisualMarkdown('| A | B |\n| :--- | ---: |\n| 1 | 2 |')).toBe(true);
  expect(supportsVisualMarkdown('| A |\n| --- |')).toBe(true);
});

test('semantic comparison catches changed Markdown while allowing equivalent delimiters', () => {
  expect(sameMarkdownMeaning('__bold__\n', '**bold**')).toBe(true);
  expect(sameMarkdownMeaning('literal \\*stars\\*', 'literal *stars*')).toBe(false);
  expect(sameMarkdownMeaning('```sh\necho hi\n```', '```\necho hi\n```')).toBe(false);
});
