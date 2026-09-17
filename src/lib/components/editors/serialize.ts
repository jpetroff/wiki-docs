import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import type { RootContent } from 'hast';
import type { OutputData } from '@bloklabs/core';

const html = unified().use(rehypeParse, { fragment: true });
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/([\\`*_[\]<>~#|!(){}.+=\-])/g, '\\$1');
const fenceFor = (text: string, minimum: number) => '`'.repeat(Math.max(minimum, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1)));
function plain(node: RootContent): string {
  return node.type === 'text' ? node.value : 'children' in node ? node.children.map(plain).join('') : '';
}
function inline(node: RootContent): string {
  if (node.type === 'text') return escape(node.value);
  if (node.type !== 'element') return '';
  if (node.tagName === 'code') {
    const text = plain(node).replace(/\n/g, ' ');
    const fence = fenceFor(text, 1);
    const pad = /^`|`$|^ .* $/.test(text) && !/^ +$/.test(text) ? ' ' : '';
    return fence + pad + text + pad + fence;
  }
  const content = node.children.map(inline).join('');
  const wrap = (mark: string) => content.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, before, body, after) => before + (body ? mark + body + mark : '') + after);
  switch (node.tagName) {
    case 'strong': case 'b': return wrap('**');
    case 'em': case 'i': return wrap('*');
    case 's': case 'del': case 'strike': return wrap('~~');
    case 'br': return '  \n';
    case 'a': {
      const href = String(node.properties.href ?? '').replace(/[<>\s\\]/g, (character) => encodeURIComponent(character));
      const title = node.properties.title ? ` "${String(node.properties.title).replace(/[\\"]/g, '\\$&')}"` : '';
      return `[${content}](<${href}>${title})`;
    }
    default: return content;
  }
}
export function inlineMarkdown(value: unknown): string {
  return html.parse(typeof value === 'string' ? value : '').children.map(inline).join('');
}

/** Serialize only the enabled tool schema. Raw code must never pass through HTML parsing. */
export function serializeMarkdown(data: OutputData): string {
  const byId = new Map(data.blocks.map((block) => [block.id, block]));
  const depthOf = (block: OutputData['blocks'][number], seen = new Set<string>()): number => {
    if (block.parent && !seen.has(block.parent)) {
      seen.add(block.parent);
      const parent = byId.get(block.parent);
      if (parent) return 1 + depthOf(parent, seen);
    }
    return Math.max(0, Math.min(20, Number(block.indent ?? block.data.depth) || 0));
  };
  return data.blocks.map((block, index) => {
    const value = block.data;
    const text = inlineMarkdown(value.text);
    let result: string;
    switch (block.type) {
      case 'paragraph': result = text; break;
      case 'header': result = '#'.repeat(Math.min(6, Math.max(1, Number(value.level) || 1))) + ' ' + text; break;
      case 'quote': result = text.split('\n').map((line) => '> ' + line).join('\n'); break;
      case 'divider': result = '---'; break;
      case 'code': {
        const code = String(value.code ?? '');
        const fence = fenceFor(code, 3);
        const language = value.language === 'plain text' ? '' : String(value.language ?? '').replace(/[\r\n`]/g, '');
        result = `${fence}${language}\n${code}\n${fence}`;
        break;
      }
      case 'list': {
        const marker = value.style === 'ordered' ? `${Math.max(1, Number(value.start) || 1)}. ` : value.style === 'checklist' ? `- [${value.checked ? 'x' : ' '}] ` : '- ';
        result = marker + text.replace(/\n/g, '\n' + ' '.repeat(marker.length));
        break;
      }
      default: throw new Error('This block cannot be saved as Markdown. Remove it before saving.');
    }
    const indentation = '    '.repeat(Math.min(20, depthOf(block)));
    result = result.split('\n').map((line) => indentation + line).join('\n');
    const previous = data.blocks[index - 1];
    const separator = !previous ? '' : previous.type === 'list' && block.type === 'list' ? '\n' : '\n\n';
    return separator + result;
  }).join('');
}
