import { splitFrontmatter } from '../../shared/frontmatter';
export { splitFrontmatter } from '../../shared/frontmatter';
import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: true, linkify: true, typographer: false });
/** Conservative check: source mode keeps unsupported syntax byte-for-byte. */
export function supportsVisualMarkdown(source: string): boolean {
  const { body } = splitFrontmatter(source);
  const tokens = parser.parse(body, {});
  // Reference definitions (including unused ones) must survive, as must raw HTML.
  if (/^ {0,3}\[[^\]\n]+\]:/m.test(body)) return false;
  return !tokens.some((token) => token.type === 'html_block' || (token.type === 'table_open' && token.level !== 0) ||
    token.children?.some((child) => child.type === 'html_inline' || child.type === 'image'));
}

export function sameMarkdownMeaning(before: string, after: string): boolean {
  return parser.render(before) === parser.render(after);
}

export function restoreMarkdown(source: string, markdown: string, baseline: string): string {
  if (markdown === baseline) return source;
  const { prefix, body } = splitFrontmatter(source);
  const eol = body.includes('\r\n') || prefix.includes('\r\n') ? '\r\n' : '\n';
  return prefix + markdown.replace(/\r\n/g, '\n').replace(/\n*$/, body.endsWith('\n') ? '\n' : '').replace(/\n/g, eol);
}
