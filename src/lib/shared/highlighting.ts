/** Shared by the reader and future editor adapters; no server dependencies. */
export const highlightTheme = 'github-dark' as const;
export const highlightLanguages = [
  'shellscript', 'json', 'yaml', 'toml', 'python', 'hcl', 'dockerfile',
  'javascript', 'typescript', 'markdown', 'ini'
] as const;
export type HighlightLanguage = typeof highlightLanguages[number] | 'text';
const aliases: Record<string, HighlightLanguage> = {
  sh: 'shellscript', bash: 'shellscript', shell: 'shellscript', bash_profile: 'shellscript',
  js: 'javascript', ts: 'typescript', md: 'markdown', py: 'python', yml: 'yaml',
  tf: 'hcl', terraform: 'hcl', systemd: 'ini', plaintext: 'text', txt: 'text'
};
export function normalizeLanguage(info: string): HighlightLanguage {
  const name = info.trim().split(/\s+/)[0].toLowerCase();
  return (Object.hasOwn(aliases, name) ? aliases[name] : undefined) ?? (highlightLanguages.includes(name as typeof highlightLanguages[number])
    ? name as HighlightLanguage : 'text');
}
/** Insertion order also defines extensionless page lookup precedence. */
export const documentExtensions = {
  '.md': 'markdown', '.sh': 'shellscript', '.txt': 'text', '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.py': 'python', '.tf': 'hcl'
} as const satisfies Record<string, HighlightLanguage>;
export const imageExtensions = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif'
} as const;
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot);
}
export function sourceLanguage(path: string): HighlightLanguage {
  return documentExtensions[extensionOf(path) as keyof typeof documentExtensions] ?? 'text';
}
