export type DocumentationMode = 'view' | 'edit' | 'files';

export type DocumentationRequest = {
  kind: 'documentation';
  /** URL pathname only. Decode and validate in the future filesystem resolver. */
  pathname: string;
  mode: DocumentationMode;
};

export type WikiRequest =
  | DocumentationRequest
  | { kind: 'service'; pathname: string };
