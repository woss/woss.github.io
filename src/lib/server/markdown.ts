import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { rehypeMermaidTabs } from './rehype-mermaid-tabs.ts';
import { load } from 'js-yaml';
import type { Root, Element, Text } from 'hast';

function walkElement(
  node: Element | Root,
  callback: (node: Element, index: number, parent: Element) => void,
  parent?: Element,
  index?: number,
): void {
  if (node.type === 'element' && parent) {
    callback(node as Element, index!, parent);
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child && typeof child === 'object' && 'type' in child && child.type === 'element') {
        walkElement(child as Element, callback, node as Element, i);
      }
    }
  }
}

function rehypeLazyLoad() {
  return (tree: Root) => {
    walkElement(tree, (node) => {
      if (node.tagName === 'img') {
        node.properties.loading = 'lazy';
      }
    });
  };
}

const ADMONITION_PATTERN = /^\[!(INFO|WARNING|ERROR|SUCCESS)\]\s*/i;

function isText(node: unknown): node is Text {
  return typeof node === 'object' && node !== null && (node as { type: string }).type === 'text';
}

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as { type: string }).type === 'element';
}

function findFirstChild(node: Element, tagName: string): Element | undefined {
  for (const child of node.children) {
    if (isElement(child) && child.tagName === tagName) return child;
  }
  return undefined;
}

function rehypeAdmonitions() {
  return (tree: Root) => {
    walkElement(tree, (node, index, parent) => {
      if (node.tagName !== 'blockquote') return;
      if (!node.children || node.children.length === 0) return;

      const firstP = findFirstChild(node, 'p');
      if (!firstP || !firstP.children || firstP.children.length === 0) return;

      const textNode = firstP.children[0];
      if (!isText(textNode)) return;

      const match = textNode.value.match(ADMONITION_PATTERN);
      if (!match) return;

      const type = match[1].toLowerCase() as 'info' | 'warning' | 'error' | 'success';

      // Strip the [!TYPE] label from the text node
      textNode.value = textNode.value.replace(ADMONITION_PATTERN, '');

      // Replace the blockquote element with a div.admonition
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['admonition', `admonition-${type}`] },
        children: node.children,
      } as Element;
    });
  };
}

function createProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeAdmonitions)
    .use(rehypeHighlight)
    .use(rehypeMermaidTabs)
    .use(rehypeLazyLoad)
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
 * Returns { data, content } where content has frontmatter stripped.
 */
export async function parseMarkdownFrontmatter(content: string): Promise<{ data: Record<string, unknown>; content: string }> {
  const YAML_FM_RE = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(YAML_FM_RE);
  if (match) {
    const data = (load(match[1]) as Record<string, unknown>) ?? {};
    const body = content.slice(match[0].length);
    return { data, content: body };
  }
  return { data: {}, content };
}


