import { describe, it, expect } from 'bun:test';
import { parseFrontmatter } from './index.js';

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter', async () => {
    const content = `---
company: Test Corp
role: Developer
skills: [Rust, TypeScript]
---
Body content here.`;
    const { data: frontmatter, content: body } = await parseFrontmatter(content);
    expect(frontmatter.company).toBe('Test Corp');
    expect(frontmatter.role).toBe('Developer');
    expect(frontmatter.skills).toEqual(['Rust', 'TypeScript']);
    expect(body.trim()).toBe('Body content here.');
  });

  it('returns empty frontmatter and full body when no delimiters', async () => {
    const content = 'Just content without frontmatter.';
    const { data: frontmatter, content: body } = await parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('parses null values', async () => {
    const content = `---
endDate: null
---
Body.`;
    const { data: frontmatter } = await parseFrontmatter(content);
    expect(frontmatter.endDate).toBeNull();
  });

  it('handles YAML comments with #', async () => {
    const content = `---
company: Test
# this is a comment
role: Dev
---
Body.`;
    const { data: frontmatter } = await parseFrontmatter(content);
    expect(frontmatter.company).toBe('Test');
    expect(frontmatter.role).toBe('Dev');
  });
});
