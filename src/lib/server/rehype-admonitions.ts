import type { Root, Element, Text } from 'hast';

const ADMONITION_TYPES = ['INFO', 'WARNING', 'ERROR', 'SUCCESS'] as const;
type AdmonitionType = (typeof ADMONITION_TYPES)[number];

const ADMONITION_PATTERN = /^\[!(INFO|WARNING|ERROR|SUCCESS)\]\s*/i;

function isText(node: unknown): node is Text {
  return typeof node === 'object' && node !== null && (node as { type: string }).type === 'text';
}

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as { type: string }).type === 'element';
}

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

export function rehypeAdmonitions() {
  return (tree: Root) => {
    walkElement(tree, (node, index, parent) => {
      if (node.tagName !== 'blockquote') return;
      if (!node.children || node.children.length === 0) return;

      const firstChild = node.children[0];
      if (!isElement(firstChild) || firstChild.tagName !== 'p') return;
      if (!firstChild.children || firstChild.children.length === 0) return;

      const textNode = firstChild.children[0];
      if (!isText(textNode)) return;

      const match = textNode.value.match(ADMONITION_PATTERN);
      if (!match) return;

      const type = match[1].toLowerCase() as Lowercase<AdmonitionType>;

      // Strip the [!TYPE] label from the text node
      textNode.value = textNode.value.replace(ADMONITION_PATTERN, '');

      // Replace the blockquote element with a div.admonition
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: [`admonition`, `admonition-${type}`] },
        children: node.children,
      } as Element;
    });
  };
}
