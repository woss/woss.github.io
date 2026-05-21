import { error } from '@sveltejs/kit';
import { getPageContent } from '$lib/server/db';
import { renderMarkdown } from '$lib/server/markdown';

type HeaderImage = { alt: string; url: string } | null;

export async function load({ params }: { params: Record<string, string> }) {
  const { slug } = params;

  const allPosts = getPageContent('post');
  const currentRaw = allPosts.find((p) => p.slug === slug);
  if (!currentRaw) {
    throw error(404, 'Post not found');
  }

  const headerImage: HeaderImage = currentRaw.headerImage;

  const current = {
    slug: currentRaw.slug,
    title: currentRaw.title || '',
    date: currentRaw.date || null,
    tags: currentRaw.tags,
    excerpt: currentRaw.excerpt || '',
    body: currentRaw.content,
    headerImage,
    toc: currentRaw.toc,
  };

  const published = allPosts
    .filter((p) => p.published)
    .map((p) => ({
      slug: p.slug,
      title: p.title || '',
      date: p.date || null,
    }))
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

  const html = await renderMarkdown(current.body);
  const h1Stripped = html.replace(/^<h1[^>]*>.*?<\/h1>\s*/i, '');

  const currentIndex = published.findIndex((p) => p.slug === slug);
  const nav = {
    prev:
      currentIndex < published.length - 1
        ? { slug: published[currentIndex + 1].slug, title: published[currentIndex + 1].title }
        : null,
    next:
      currentIndex > 0 ? { slug: published[currentIndex - 1].slug, title: published[currentIndex - 1].title } : null,
  };

  return {
    post: {
      slug: current.slug,
      title: current.title,
      date: current.date,
      tags: current.tags,
      excerpt: current.excerpt,
      headerImage: current.headerImage,
      toc: current.toc,
    },
    html: h1Stripped,
    nav,
  };
}
