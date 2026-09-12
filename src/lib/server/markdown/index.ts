import { notImplemented, type ServiceResult } from '../../shared/result';

export interface MarkdownService {
  render(markdown: string, sourcePath: string): Promise<ServiceResult<{ html: string }>>;
}

// The later implementation must sanitize HTML and resolve relative links against
// sourcePath. Do not import Blok here: it belongs to the future client editor.
export const markdownService: MarkdownService = {
  async render() { return notImplemented('Markdown rendering'); }
};
