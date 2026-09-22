import { beforeEach, expect, mock, test } from 'bun:test';

const source = '| Header |\n| --- |\n| cell |\n';
let exported = source;
let destroyed = false;
let exportCalls = 0;

class Tool {}
mock.module('@bloklabs/core/tools', () => ({
  Paragraph: Tool, Header: Tool, List: Tool, Quote: Tool, Divider: Tool, Code: Tool, Table: Tool,
  Bold: Tool, Italic: Tool, Link: Tool, Strikethrough: Tool, InlineCode: Tool
}));
mock.module('@bloklabs/core/markdown', () => ({
  markdownToBlocksWithReport: async () => ({ blocks: [{ type: 'table', data: {} }], warnings: [] })
}));
mock.module('@bloklabs/core', () => ({
  Blok: class {
    isReady = Promise.resolve();
    blocks = { exportMarkdown: async () => { exportCalls++; return exported; } };
    destroy() { destroyed = true; }
  }
}));
const { mountBlok } = await import('./blok');

beforeEach(() => { exported = source; destroyed = false; exportCalls = 0; });

test('unchanged native table export preserves original bytes and frontmatter', async () => {
  const original = '---\r\ntitle: Table\r\n---\r\n' + source.replace(/\n/g, '\r\n');
  const adapter = await mountBlok({} as HTMLElement, original, () => {});
  expect(adapter).not.toBeNull();
  expect(await adapter!.getValue()).toBe(original);
  expect(exportCalls).toBe(2);
  adapter!.destroy();
  expect(destroyed).toBe(true);
});

test('edited content uses native Markdown output without custom cell conversion', async () => {
  const adapter = await mountBlok({} as HTMLElement, source, () => {});
  expect(adapter).not.toBeNull();
  exported = '| Header |\n| --- |\n| first<br>second |';
  expect(await adapter!.getValue()).toBe(exported + '\n');
  adapter!.destroy();
});

test('native import/export changes still fall back to source mode', async () => {
  const adapter = await mountBlok({} as HTMLElement, source.replace('| --- |', '| ---: |'), () => {});
  expect(adapter).toBeNull();
  expect(destroyed).toBe(true);
});
