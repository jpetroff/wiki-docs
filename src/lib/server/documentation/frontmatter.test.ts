import { expect, test } from 'bun:test';
import { splitFrontmatter } from '../../shared/frontmatter';
import { parseFrontmatter } from './frontmatter';
import { documentStem } from './filenames';
import { markdownService } from '../markdown';

test('recognizes complete leading YAML, empty blocks, BOM, CRLF, and alternate terminator', () => {
  const source = '\uFEFF---\r\ntitle: "  A title  "\r\nextra: [one, {two: null}]\r\n...\r\n# Body\r\n';
  expect(parseFrontmatter(source)).toMatchObject({ title: 'A title', body: '# Body\r\n', warning: undefined });
  expect(splitFrontmatter(source).prefix + splitFrontmatter(source).body).toBe(source);
  expect(parseFrontmatter('---\n---\nBody').body).toBe('Body');
  for (const source of ['---\ntitle: Unclosed', 'Text\n---\ntitle: Later\n---\nBody']) {
    expect(splitFrontmatter(source)).toMatchObject({ prefix: '', body: source });
  }
});

test('only nonempty string titles are used; invalid YAML does not reject content', () => {
  for (const yaml of ['title: null', 'title: 42', 'title: [one]', 'title: " "', '- one', 'other: anything']) {
    expect(parseFrontmatter(`---\n${yaml}\n---\n# Body`).title).toBeUndefined();
  }
  const invalid = parseFrontmatter('---\ntitle: [broken\n---\n# Body');
  expect(invalid.warning).toBeDefined();
  expect(invalid.body).toBe('# Body');
});

test('front matter controls rendered title without adding a heading or exposing metadata', async () => {
  const result = await markdownService.render('---\ntitle: "<b>Title</b>"\nsecret: value\n---\n## Body', 'file.md');
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') return;
  expect(result.value.title).toBe('<b>Title</b>');
  expect(result.value.html).toContain('user-content-body');
  expect(result.value.html).not.toContain('secret');
  expect(result.value.html).not.toContain('Title');
  const fallback = await markdownService.render('---\ntitle: [broken\n---\n# Body', 'file.md');
  expect(fallback).toMatchObject({ status: 'ok', value: { title: 'Body' } });
});

test('new filenames prefer YAML title and retain H1 fallback', () => {
  expect(documentStem('---\ntitle: Héllo 世界\n---\n# Other')).toBe('héllo-世界');
  expect(documentStem('---\ntitle: Only metadata\n---\nBody')).toBe('only-metadata');
  expect(documentStem('---\ntitle: 42\n---\n# Fallback')).toBe('fallback');
  expect(documentStem('---\ntitle: [broken\n---\n# Fallback')).toBe('fallback');
});
