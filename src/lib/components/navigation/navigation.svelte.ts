import type { DirectoryNode } from '$lib/shared/navigation';

export const navigationKey = Symbol('documentation-navigation');
export class NavigationState {
  pendingEdit?: { path: string; content: string; saved: string; revision: string };
  folders = $state<Record<string, DirectoryNode>>(Object.create(null));
  expanded = $state<Record<string, boolean>>(Object.assign(Object.create(null), { '': true }));
  constructor(root: DirectoryNode | null) { if (root) this.seed(root); }
  seed(root: DirectoryNode) {
    const folders: Record<string, DirectoryNode> = Object.create(null);
    const pending = [root];
    while (pending.length) {
      const folder = pending.pop()!;
      folders[folder.path] = folder;
      for (const child of folder.children ?? []) if (child.kind === 'directory') pending.push(child);
    }
    this.folders = folders;
  }
  expand(path: string) {
    if (this.folders[path]) this.setExpanded(path, true);
  }
  collapse(path: string) {
    this.setExpanded(path, false);
  }
  private setExpanded(path: string, expanded: boolean) {
    // Svelte does not proxy null-prototype dictionaries; replace the state value.
    this.expanded = Object.assign(Object.create(null), this.expanded, { [path]: expanded });
  }
  reveal(parent: string) {
    const parts = parent ? parent.split('/') : [];
    this.expand('');
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      this.expand(path);
    }
  }
}
