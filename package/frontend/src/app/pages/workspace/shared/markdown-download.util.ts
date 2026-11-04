const DEFAULT_FILE_NAME = 'note';
const MAX_FILE_NAME_LENGTH = 60;
const MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8';
const FIRST_HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*#*\s*$/m;
// Characters that are invalid in file names on common operating systems, plus control characters.
const UNSAFE_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Builds a safe `.md` file name from the first heading, falling back to a default name. */
export function buildMarkdownFileName(source: string): string {
  const heading = FIRST_HEADING_PATTERN.exec(source)?.[1] ?? '';
  const baseName = heading
    .replace(UNSAFE_FILE_NAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();

  return `${baseName || DEFAULT_FILE_NAME}.md`;
}

/** Triggers a browser download of the Markdown source as a `.md` file. */
export function downloadMarkdown(source: string): void {
  const url = URL.createObjectURL(new Blob([source], { type: MARKDOWN_MIME_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = buildMarkdownFileName(source);
  link.click();
  URL.revokeObjectURL(url);
}
