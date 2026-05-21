import MarkdownIt from 'markdown-it';
import markdownItHighlightjs from 'markdown-it-highlightjs';
import DOMPurify from 'isomorphic-dompurify';
import { addMaculaRef } from './macula-utils';

/**
 * Creates a configured MarkdownIt instance with consistent styling and Macula integration.
 * Call this fresh when rendering — construction overhead is negligible vs render time.
 */
export function createMarkdownRenderer(context: {
	chatId: string;
	messageId: string;
	queryParams: string | null;
}): MarkdownIt {
	const { chatId, messageId, queryParams } = context;
	const md = new MarkdownIt({ html: true, linkify: true });

	// Blockquote
	md.renderer.rules.blockquote_open = () => {
		return '<blockquote class="border-l-4 border-primary/30 pl-4 text-on-surface-variant italic my-2">';
	};

	// Table
	md.renderer.rules.table_open = () => {
		return '<div class="overflow-x-auto my-2"><table class="w-full table-auto border-collapse border border-[rgba(255,255,255,0.08)]">';
	};
	md.renderer.rules.table_close = () => {
		return '</table></div>';
	};

	// Ordered list
	md.renderer.rules.ordered_list_open = () => {
		return '<ol class="list-decimal p-0 ml-5 space-y-0.5 my-1">';
	};

	// Bullet list
	md.renderer.rules.bullet_list_open = () => {
		return '<ul class="list-disc p-0 ml-5 space-y-0.5 my-1">';
	};

	// List items
	md.renderer.rules.list_item_open = () => {
		return '<li class="leading-normal">';
	};

	// Heading styles
	const headingSizes: Record<string, string> = {
		'1': 'text-xl font-heading font-semibold text-on-surface mt-6 mb-3',
		'2': 'text-lg font-heading font-semibold text-on-surface mt-5 mb-2',
		'3': 'text-base font-heading font-semibold text-on-surface mt-4 mb-2',
		'4': 'text-sm font-heading font-semibold text-on-surface mt-3 mb-1',
		'5': 'text-xs font-heading font-semibold text-on-surface-variant mt-3 mb-1',
		'6': 'text-xs font-heading text-on-surface-variant mt-2 mb-1 uppercase tracking-wider',
	};
	md.renderer.rules.heading_open = (tokens, idx) => {
		const token = tokens[idx];
		const level = token.tag.slice(1);
		return `<${token.tag} class="${headingSizes[level] || 'text-base font-semibold mt-4 mb-2'}">`;
	};

	// Horizontal rule
	md.renderer.rules.hr = () => {
		return '<hr class="border-t border-[rgba(255,255,255,0.08)] my-4">';
	};

	// Paragraph spacing
	md.renderer.rules.paragraph_open = () => {
		return '<p class="my-2">';
	};

	// Emphasis
	md.renderer.rules.em_open = () => {
		return '<em class="italic text-on-surface-variant/90">';
	};
	md.renderer.rules.em_close = () => {
		return '</em>';
	};

	// Strong
	md.renderer.rules.strong_open = () => {
		return '<strong class="font-semibold">';
	};
	md.renderer.rules.strong_close = () => {
		return '</strong>';
	};

	// Links — uses context for Macula tracking
	md.renderer.rules.link_open = (tokens, idx) => {
		const token = tokens[idx];
		const href = token.attrGet('href');
		if (href && !href.startsWith('#')) {
			if (href.includes('u.macula.link')) {
				const refHref = addMaculaRef(href, chatId, messageId, queryParams ?? undefined);
				token.attrSet('href', refHref);
				token.attrSet('target', '_blank');
				token.attrSet('rel', 'noopener');
			} else {
				token.attrSet('target', '_blank');
				token.attrSet('rel', 'noopener noreferrer');
			}
		}
		const attrs = token.attrs?.map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`).join(' ') || '';
		return `<a${attrs ? ' ' + attrs : ''}>`;
	};

	// Custom image renderer — wrap Macula images in a link to macula.link + tracking ref
	const defaultImageRenderer = md.renderer.rules.image!;
	md.renderer.rules.image = (tokens, idx, options, env, self) => {
		const token = tokens[idx];
		const src = token.attrGet('src') || '';
		token.attrSet('class', 'max-w-full h-auto min-h-52 rounded-lg my-2 shadow-lg');
		token.attrSet('loading', 'lazy');

		let modifiedSrc = src;
		if (queryParams) {
			const separator = src.includes('?') ? '&' : '?';
			modifiedSrc = `${src}${separator}${queryParams}`;
			token.attrSet('src', modifiedSrc);
		}

		const maculaMatch = modifiedSrc.match(/https?:\/\/u\.macula\.link\/([a-zA-Z0-9@_-]+)/);
		if (maculaMatch && !maculaMatch[1].startsWith('@')) {
			const unifiedId = maculaMatch[1];
			const presetSep = modifiedSrc.includes('?') ? '&' : '?';
			token.attrSet('src', `${modifiedSrc}${presetSep}preset=sys_md`);
			const imgHtml = defaultImageRenderer(tokens, idx, options, env, self);
			const href = addMaculaRef(`https://u.macula.link/${unifiedId}`, chatId, messageId, queryParams ?? undefined);
			return `<a href="${href}" target="_blank" rel="noopener" class="inline-block hover:opacity-90 transition-opacity duration-150">${imgHtml}</a>`;
		}

		return defaultImageRenderer(tokens, idx, options, env, self);
	};

	md.use(markdownItHighlightjs);
	return md;
}

/**
 * Fix link formatting: [[text](url)](url) → [text](url) and [[text](url)] → [text](url)
 */
export function preprocessMarkdown(text: string): string {
	let result = text.replace(/\[\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)/g, '[$1]($2)');
	result = result.replace(/\[\[([^\]]+)\]\(([^)]+)\)\]/g, '[$1]($2)');
	return result;
}

export function sanitizeHtml(html: string): string {
	return DOMPurify.sanitize(html);
}
