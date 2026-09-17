import type { DirectoryNode } from '$lib/shared/navigation';

export const navigationKey = Symbol('documentation-navigation');
export class NavigationState {
  pendingEdit?: { path: string; content: string; saved: string; revision: string };
  folders = $state<Record<string, DirectoryNode>>({});
  expanded = $state<Record<string, boolean>>({ '': true });
  loading = $state<Record<string, boolean>>({});
  errors = $state<Record<string, string>>({});
  private requests = new Map<string, Promise<void>>();

  constructor(root: DirectoryNode | null) { if (root) this.seed(root); }
  seed(folder: DirectoryNode) {
    const previous = this.folders[folder.path];
    this.folders[folder.path] = { ...folder, ...(!folder.hasChildren ? { children: [] } :
      folder.children === undefined && previous?.children ? { children: previous.children } : {}) };
    for (const child of folder.children ?? []) if (child.kind === 'directory') this.seed(child);
  }
  async load(path: string, refresh = false) {
    const pending = this.requests.get(path);
    if (pending) return pending;
    if (!refresh && this.folders[path]?.children) return;
    const request = (async () => {
      this.loading[path] = true;
      this.errors[path] = '';
      try {
        const response = await fetch('/_/api/folders?' + new URLSearchParams({ path, depth: '1' }));
        const result = await response.json();
        if (!response.ok || result.status !== 'ok') throw new Error(result.message ?? 'Unable to load folder');
        this.seed(result.value);
      } catch (error) {
        this.errors[path] = error instanceof Error ? error.message : 'Unable to load folder';
      } finally { this.loading[path] = false; }
    })();
    this.requests.set(path, request);
    try { await request; } finally { this.requests.delete(path); }
  }
  async expand(path: string) {
    this.expanded[path] = true;
    await this.load(path, true);
  }
  async reveal(parent: string) {
    const parts = parent ? parent.split('/') : [];
    await this.expand('');
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      await this.expand(path);
    }
  }
}
