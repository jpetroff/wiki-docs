import * as monaco from 'monaco-editor/editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import 'monaco-editor/languages/definitions/shell/register';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/yaml/register';
import 'monaco-editor/languages/definitions/hcl/register';
import 'monaco-editor/languages/definitions/ini/register';
import 'monaco-editor/languages/definitions/markdown/register';
import { sourceLanguage, highlightTheme } from '$lib/shared/highlighting';
import type { EditorAdapter } from './types';

// Vite emits same-origin worker assets beneath the application's reserved path.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.editor.defineTheme(highlightTheme, {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'comment', foreground: '6A737D' },
    { token: 'keyword', foreground: 'F97583' },
    { token: 'string', foreground: '9ECBFF' },
    { token: 'number', foreground: '79B8FF' }
  ],
  colors: { 'editor.background': '#24292e', 'editor.foreground': '#e1e4e8' }
});
// TOML is absent from Monaco's bundled grammars; provide its basic syntax.
monaco.languages.register({ id: 'toml' });
monaco.languages.setMonarchTokensProvider('toml', { tokenizer: { root: [
  [/#.*$/, 'comment'], [/"(?:[^"\\]|\\.)*"|'[^']*'/, 'string'],
  [/\b(?:true|false)\b/, 'keyword'], [/[+-]?\b\d[\d_.-]*\b/, 'number'],
  [/\[.*?\]/, 'type'], [/[^\s=]+(?=\s*=)/, 'key']
] } });
monaco.languages.register({ id: 'json' });
monaco.languages.setMonarchTokensProvider('json', { tokenizer: { root: [
  [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'], [/"(?:[^"\\]|\\.)*"/, 'string'],
  [/\b(?:true|false|null)\b/, 'keyword'], [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number']
] } });

export function mountMonaco(holder: HTMLElement, source: string, path: string, onChange: () => void): EditorAdapter {
  const language = sourceLanguage(path);
  const model = monaco.editor.createModel(source, language === 'shellscript' ? 'shell' : language === 'text' ? 'plaintext' : language);
  const editor = monaco.editor.create(holder, {
    model, theme: highlightTheme, automaticLayout: true, minimap: { enabled: false },
    scrollBeyondLastLine: false, fontSize: 14, tabSize: 2, wordWrap: 'on',
    editContext: false,
    ariaLabel: `Source editor for ${path}`
  });
  const baseline = model.getValue();
  const listener = model.onDidChangeContent(onChange);
  return {
    // Preserve BOM, mixed line endings, and trailing bytes on an untouched file.
    async getValue() { const value = model.getValue(); return value === baseline ? source : model.getValue(undefined, true); },
    destroy() { listener.dispose(); editor.dispose(); model.dispose(); }
  };
}
