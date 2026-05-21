import { describe, it, expect } from 'bun:test';
import { chunkContent } from './chunk-content.ts';

const sampleMetadata = {
  title: 'Test Post',
  date: '2024-01-15',
  tags: ['rust', 'substrate'],
};

describe('chunkContent', () => {
  it('returns empty array for empty content', async () => {
    const result = await chunkContent('', sampleMetadata);
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only content', async () => {
    const result = await chunkContent('   \n\n   ', sampleMetadata);
    expect(result).toEqual([]);
  });

  it('returns one chunk for content without headings', async () => {
    const content = 'Simple paragraph without any headings.';
    const result = await chunkContent(content, sampleMetadata);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Simple paragraph without any headings.');
    expect(result[0].section).toBe('Test Post');
    expect(result[0].title).toBe('Test Post');
  });

  it('splits content by H2 headings', async () => {
    const content = `## First Section\n\nContent of first section.\n\n## Second Section\n\nContent of second section.`;
    const result = await chunkContent(content, sampleMetadata);
    expect(result).toHaveLength(2);
    expect(result[0].section).toBe('First Section');
    expect(result[1].section).toBe('Second Section');
    expect(result[0].text).toContain('Content of first section');
    expect(result[1].text).toContain('Content of second section');
  });

  it('splits content by H3 headings', async () => {
    const content = `### Sub Section A\n\nContent A.\n\n### Sub Section B\n\nContent B.`;
    const result = await chunkContent(content, sampleMetadata);
    expect(result).toHaveLength(2);
    expect(result[0].section).toBe('Sub Section A');
    expect(result[1].section).toBe('Sub Section B');
  });

  it('attaches metadata to each chunk', async () => {
    const content = `## Section\n\nContent here.`;
    const result = await chunkContent(content, sampleMetadata);
    expect(result[0]).toMatchObject({
      title: 'Test Post',
      date: '2024-01-15',
      tags: ['rust', 'substrate'],
    });
  });

  it('merges tiny trailing chunks below minChunkSize', async () => {
    const content = `## Big One\n\n${'A'.repeat(200)}\n\n## Big One\n\nSmall`;
    const result = await chunkContent(content, sampleMetadata, { minChunkSize: 100 });
    expect(result).toHaveLength(1);
  });

  it('handles content with no metadata fields gracefully', async () => {
    const content = `## Section\n\nText.`;
    const result = await chunkContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('');
    expect(result[0].date).toBeNull();
    expect(result[0].tags).toEqual([]);
  });

  it('hard-splits oversized sections by paragraph', async () => {
    const content = `## Large Section\n\n${'A'.repeat(1500)}\n\n${'B'.repeat(1500)}`;
    const result = await chunkContent(content, sampleMetadata, { maxChunkSize: 2000 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
