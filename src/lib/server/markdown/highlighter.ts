import { createHighlighter } from 'shiki';
import { highlightLanguages, highlightTheme, normalizeLanguage } from '../../shared/highlighting';

let highlighter: ReturnType<typeof createHighlighter> | undefined;
export async function highlightCode(code: string, language: string) {
  const instance = await (highlighter ??= createHighlighter({
    themes: [highlightTheme], langs: [...highlightLanguages]
  }));
  return instance.codeToHast(code, { lang: normalizeLanguage(language), theme: highlightTheme });
}
