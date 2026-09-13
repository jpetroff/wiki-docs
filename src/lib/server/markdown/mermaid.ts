import type MarkdownIt from 'markdown-it';

/** Preserve diagram source for browser rendering, without executing author HTML. */
export function mermaidPlugin(parser: InstanceType<typeof MarkdownIt>) {
  const fence = parser.renderer.rules.fence!;
  parser.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    if (token.info.trim().split(/\s+/)[0] !== 'mermaid') {
      return fence(tokens, index, options, env, renderer);
    }
    // A span preserves leading newlines through both server and browser HTML parsing.
    return `<div class="mermaid-block"><pre><span>${parser.utils.escapeHtml(token.content)}</span></pre></div>\n`;
  };
}
