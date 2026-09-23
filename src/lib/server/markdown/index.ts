import { parseFrontmatter } from '../documentation/frontmatter';
import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Root, Element, RootContent } from 'hast';
import type { ServiceResult } from '../../shared/result';
import { imageExtensions, extensionOf } from '../../shared/highlighting';
import { highlightCode } from './highlighter';
import { mermaidPlugin } from './mermaid';

export interface RenderedDocument { html: string; title: string; sourcePath: string }
export interface MarkdownService {
  render(markdown: string, sourcePath: string): Promise<ServiceResult<RenderedDocument>>;
}
const parser = new MarkdownIt({ html: true, linkify: true, typographer: false }).use(mermaidPlugin);
const idPrefix = 'user-content-';
const origin = 'https://documentation.invalid';
const htmlParser = unified().use(rehypeParse, { fragment: true });
const sanitizer = unified().use(rehypeSanitize, {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['open'],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', 'mermaid-block']]
  },
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'], src: ['http', 'https'] }
});
const stringify = unified().use(rehypeStringify);
function textOf(node: Root | RootContent): string {
  return node.type === 'text' ? node.value : 'children' in node ? node.children.map(textOf).join('') : '';
}
function walk(node: Root | RootContent, visit: (element: Element) => void) {
  if (node.type === 'element') visit(node);
  if ('children' in node) node.children.forEach((child) => walk(child, visit));
}
function prefixed(fragment: string) {
  return idPrefix + fragment;
}
/** Input is an HTML attribute, not a filesystem path. The endpoint validates paths separately. */
export function documentUrl(value: string, sourcePath: string, image = false): string | undefined {
  if (/^[\u0000-\u0020]*[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
    try {
      const parsed = new URL(value, origin);
      return (image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:']).includes(parsed.protocol)
        ? value : undefined;
    } catch { return; }
  }
  try {
    const source = '/' + sourcePath.split('/').map(encodeURIComponent).join('/');
    const target = new URL(value, origin + source);
    if (target.origin !== origin) return;
    const isImage = Object.hasOwn(imageExtensions, extensionOf(decodeURIComponent(target.pathname)));
    if (isImage && !target.pathname.startsWith('/_/')) target.pathname = '/_/assets' + target.pathname;
    if (target.hash && !isImage && !target.pathname.startsWith('/_/')) {
      target.hash = prefixed(decodeURIComponent(target.hash.slice(1)));
    }
    // A fragment-only link must stay on the current directory alias.
    if (value.startsWith('#')) return target.hash;
    return target.pathname + target.search + target.hash;
  } catch { return; }
}
export const markdownService: MarkdownService = {
  async render(markdown, sourcePath) {
    const frontmatter = parseFrontmatter(markdown);
    let tree = htmlParser.parse(parser.render(frontmatter.body)) as Root;
    const slugger = new GithubSlugger();
    let title = '';
    walk(tree, (node) => {
      // Preserve Markdown table alignment without admitting arbitrary author CSS.
      if (node.tagName === 'th' || node.tagName === 'td') {
        const alignment = /^text-align:\s*(left|right|center);?$/.exec(String(node.properties.style ?? ''));
        if (alignment) node.properties.align = alignment[1];
      }
      if (/^h[1-6]$/.test(node.tagName)) {
        const text = textOf(node);
        if (!title) title = text;
        if (!node.properties.id) node.properties.id = slugger.slug(text);
      }
      for (const property of ['href', 'src'] as const) {
        if (typeof node.properties[property] !== 'string') continue;
        const url = documentUrl(node.properties[property], sourcePath, property === 'src');
        if (url === undefined) delete node.properties[property];
        else node.properties[property] = url;
      }
    });
    tree = await sanitizer.run(tree) as Root;
    // Only trusted Shiki output is added after sanitizing all author HTML.
    async function highlight(node: Root | Element) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type !== 'element') continue;
        const code = child.children[0];
        if (child.tagName === 'pre' && child.children.length === 1 && code?.type === 'element' && code.tagName === 'code') {
          const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
          const language = String(classes.find((name) => String(name).startsWith('language-')) ?? '').slice(9);
          const highlighted = await highlightCode(textOf(code), language);
          node.children.splice(i, 1, ...highlighted.children as Element[]);
        } else await highlight(child);
      }
    }
    await highlight(tree);
    return { status: 'ok', value: {
      html: stringify.stringify(tree), title: frontmatter.title || title || sourcePath.split('/').at(-1) || 'Documentation', sourcePath
    } };
  }
};
export async function renderSource(content: string, sourcePath: string, language: string): Promise<RenderedDocument> {
  return { html: stringify.stringify(await highlightCode(content, language)),
    title: sourcePath.split('/').at(-1) || 'Source', sourcePath };
}
