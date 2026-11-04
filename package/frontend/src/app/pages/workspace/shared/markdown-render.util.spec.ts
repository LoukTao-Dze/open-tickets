import { renderMarkdown } from './markdown-render.util';

describe('renderMarkdown', () => {
  it('renders headings and emphasis', () => {
    const html = renderMarkdown('# Title\n\n**bold** and *italic*');

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');

    expect(html).toContain('<table>');
    expect(html).toContain('<td>2</td>');
  });

  it('renders GFM task lists', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo');

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('removes script tags', () => {
    const html = renderMarkdown('hi <script>alert(1)</script>');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)</script>');
  });

  it('removes event handler attributes from raw HTML', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');

    expect(html).not.toContain('onerror');
  });

  it('removes javascript: link targets', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');

    expect(html).not.toContain('javascript:');
  });

  it('opens rendered links in a new tab with safe rel', () => {
    const html = renderMarkdown('[site](https://example.com)');

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
