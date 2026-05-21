import { error } from '@sveltejs/kit';
import { getPageContent } from '$lib/server/db';
import { renderOgImage } from '$lib/server/og/render';

export const GET = async ({ params }: { params: { slug: string } }) => {
  const slug = params.slug;

  const posts = getPageContent('post');
  let entry = posts.find((p) => p.slug === slug);
  if (!entry) {
    const experiences = getPageContent('experience');
    entry = experiences.find((e) => e.slug === slug);
  }

  if (!entry) {
    throw error(404, 'Not found');
  }

  const meta = entry.meta;
  const title = String(meta?.title ?? '');
  const description = String(meta?.excerpt ?? meta?.description ?? '');

  const png = await renderOgImage(title, description);

  return new Response(png as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
