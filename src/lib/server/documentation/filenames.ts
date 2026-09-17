import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: true });
export function documentStem(content: string): string | undefined {
  const body = content.replace(/^(\uFEFF?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$))/, '');
  const tokens = parser.parse(body, {});
  const heading = tokens.findIndex((token) => token.type === 'heading_open' && token.tag === 'h1' && token.level === 0);
  if (heading < 0) return;
  const title = (tokens[heading + 1]?.children ?? []).map((token) =>
    ['text', 'code_inline', 'image'].includes(token.type) ? token.content :
      ['softbreak', 'hardbreak'].includes(token.type) ? ' ' : ''
  ).join('');
  return title.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || undefined;
}

export function documentFilename(stem: string, number = 1) {
  const suffix = (number > 1 ? `-${number}` : '') + '.md';
  const limit = 255 - new TextEncoder().encode(suffix).length;
  let name = '';
  let bytes = 0;
  for (const character of stem) {
    bytes += new TextEncoder().encode(character).length;
    if (bytes > limit) break;
    name += character;
  }
  return name.replace(/-+$/g, '') + suffix;
}
