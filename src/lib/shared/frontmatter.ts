/** Split only a complete leading block; preserve the prefix byte-for-byte. */
export function splitFrontmatter(source: string) {
  const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(^(?:---|\.\.\.)\r?(?:\n|$))/m.exec(source);
  const prefix = match?.index === 0 ? match[0] : '';
  return { prefix, body: source.slice(prefix.length), yaml: prefix ? match![2] : '' };
}
