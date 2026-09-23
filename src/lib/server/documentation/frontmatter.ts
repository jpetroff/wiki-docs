import { splitFrontmatter } from '../../shared/frontmatter';

export function parseFrontmatter(source: string) {
  const parts = splitFrontmatter(source);
  let title: string | undefined;
  let warning: string | undefined;
  if (parts.prefix) {
    try {
      const metadata = Bun.YAML.parse(parts.yaml);
      if (metadata && typeof metadata === 'object' && 'title' in metadata &&
          typeof metadata.title === 'string') title = metadata.title.trim() || undefined;
    } catch { warning = 'Invalid YAML front matter; title ignored'; }
  }
  return { ...parts, title, warning };
}
