export interface EditorAdapter {
  getValue(): Promise<string>;
  destroy(): void;
}
