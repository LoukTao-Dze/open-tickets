import { buildMarkdownFileName } from './markdown-download.util';

describe('buildMarkdownFileName', () => {
  it('uses the first heading', () => {
    expect(buildMarkdownFileName('intro\n\n## Sprint plan\n\n# Later')).toBe('Sprint plan.md');
  });

  it('strips characters that are unsafe in file names', () => {
    expect(buildMarkdownFileName('# a/b:c*d?')).toBe('abcd.md');
  });

  it('falls back to a default name without a heading', () => {
    expect(buildMarkdownFileName('just text')).toBe('note.md');
    expect(buildMarkdownFileName('')).toBe('note.md');
    expect(buildMarkdownFileName('# /')).toBe('note.md');
  });

  it('limits long names', () => {
    expect(buildMarkdownFileName(`# ${'a'.repeat(200)}`).length).toBe(60 + '.md'.length);
  });
});
