import DOMPurify from 'dompurify';
import { marked } from 'marked';

const LINK_TARGET = '_blank';
const LINK_REL = 'noopener noreferrer';
const MARKDOWN_OPTIONS = { async: false, gfm: true, breaks: false } as const;

DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', LINK_TARGET);
    node.setAttribute('rel', LINK_REL);
  }
});

/**
 * Converts Markdown (CommonMark + GFM) to HTML.
 * The output is sanitized with DOMPurify so user-authored scripts and event handlers are removed.
 */
export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source, MARKDOWN_OPTIONS);
  return DOMPurify.sanitize(rawHtml);
}
