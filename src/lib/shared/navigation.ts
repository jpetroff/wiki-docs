export interface FileEntry { kind: 'file'; name: string; path: string }
export interface DirectoryNode {
  kind: 'directory';
  name: string;
  path: string;
  hasIndex: boolean;
  hasChildren: boolean;
  children?: NavigationEntry[];
}
export type NavigationEntry = FileEntry | DirectoryNode;
export const documentUrl = (path: string) => '/' + path.split('/').map(encodeURIComponent).join('/');
export const parentPath = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const childPath = (parent: string, name: string) => parent ? `${parent}/${name}` : name;
