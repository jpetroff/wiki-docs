import { Blok } from '@bloklabs/core';
import { Paragraph, Header, List, Quote, Divider, Code, Table, Bold, Italic, Link, Strikethrough, InlineCode } from '@bloklabs/core/tools';
import { markdownToBlocksWithReport } from '@bloklabs/core/markdown';
import { supportsVisualMarkdown, sameMarkdownMeaning, splitFrontmatter, restoreMarkdown } from './markdown';
import type { EditorAdapter } from './types';

// Blok's default paragraph/heading menus include colors, and quotes have sizes.
// Override those menus rather than hiding non-Markdown controls with CSS.
class MarkdownParagraph extends Paragraph { renderSettings() { return []; } }
class MarkdownHeader extends Header {
  static get toolbox() {
    const entries = Header.toolbox;
    return Array.isArray(entries) ? entries.filter((entry) => !entry.data?.isToggleable) : entries;
  }
  renderSettings() {
    const settings = super.renderSettings();
    return Array.isArray(settings) ? settings.filter((item) => 'name' in item && item.name === 'header-levels') : [];
  }
}
class MarkdownQuote extends Quote { renderSettings() { return []; } }
class MarkdownCode extends Code { renderSettings() { return []; } }
const allowed = new Set(['paragraph', 'header', 'list', 'quote', 'divider', 'code', 'table']);

export async function mountBlok(holder: HTMLElement, source: string, onChange: () => void): Promise<EditorAdapter | null> {
  if (!supportsVisualMarkdown(source)) return null;
  const { body } = splitFrontmatter(source);
  const imported = await markdownToBlocksWithReport(body);
  if (imported.warnings.length || imported.blocks.some((block) => !allowed.has(block.type))) return null;
  let ready = false;
  const editor = new Blok({
    holder, theme: 'dark', defaultBlock: 'paragraph',
    data: { blocks: imported.blocks },
    inlineToolbar: ['bold', 'italic', 'link', 'strikethrough', 'inlineCode'],
    tools: {
      paragraph: { class: MarkdownParagraph, inlineToolbar: true },
      header: { class: MarkdownHeader, inlineToolbar: true, config: { levels: [1, 2, 3, 4, 5, 6] } },
      list: { class: List, inlineToolbar: true, config: { styles: ['unordered', 'ordered', 'checklist'] } },
      quote: { class: MarkdownQuote, inlineToolbar: true },
      divider: Divider,
      code: { class: MarkdownCode, inlineToolbar: false },
      table: { class: Table, inlineToolbar: true, config: { withHeadings: true } },
      bold: Bold, italic: Italic, link: Link, strikethrough: Strikethrough, inlineCode: InlineCode
    },
    onBeforePaste: () => null,
    onChange: () => { if (ready) onChange(); }
  });
  try {
    await editor.isReady;
    const baseline = await editor.blocks.exportMarkdown();
    if (!sameMarkdownMeaning(body, baseline)) { editor.destroy(); return null; }
    ready = true;
    return {
      async getValue() {
        return restoreMarkdown(source, await editor.blocks.exportMarkdown(), baseline);
      },
      destroy: () => { ready = false; editor.destroy(); }
    };
  } catch (error) { editor.destroy(); throw error; }
}
