import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { rehypeMermaidTabs } from './rehype-mermaid-tabs.ts';
import matter from 'gray-matter';

function createProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeHighlight)
    .use(rehypeMermaidTabs)
    .use(rehypeSlug)
    .use(rehypeStringify);
}

let processor: ReturnType<typeof createProcessor> | null = null;

function getProcessor() {
  if (!processor) {
    processor = createProcessor();
  }
  return processor;
}

/**
 * Render markdown content to HTML using unified/remark pipeline.
 * Automatically strips frontmatter. Handles code highlighting.
 */
export async function renderMarkdown(content: string): Promise<string> {
  const result = await getProcessor().process(content);
  return String(result);
}

/**
 * Parse frontmatter from markdown content using js-yaml.
 * Returns { frontmatter, body } where body has frontmatter stripped.
 */
export async function parseMarkdownFrontmatter(content: string): Promise<matter.GrayMatterFile<string>> {
  const m = matter(content);
  return m;
}

/**
 * Extract a short excerpt from markdown body (first sentence/paragraph).
 */
export function extractExcerpt(body: string): string {
  const noHeadings = body.replace(/^#{1,6}\s+.*$/gm, '').trim();
  const paragraphs = noHeadings.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return '';
  const firstPara = paragraphs[0].trim();
  const sentenceMatch = firstPara.match(/^([^.!?:]*[.!?:])/);
  const excerpt = sentenceMatch ? sentenceMatch[1].trim() : firstPara.slice(0, 180).trim() + '...';
  return excerpt.length > 200 ? excerpt.slice(0, 197) + '...' : excerpt;
}
