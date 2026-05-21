<script lang="ts">
  import 'highlight.js/styles/atom-one-dark.css';
  import { toast } from 'svelte-sonner';
  import ImageAttribution from '$lib/components/ImageAttribution.svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Seo from '$lib/components/Seo.svelte';

  type Post = { slug: string; title: string; date: string | null; tags: string[]; excerpt: string; headerImage: { alt: string; url: string } | null; toc: { id: string; text: string; level: number }[] };
  type NavLink = { slug: string; title: string } | null;

  let {
    data
  }: {
    data: { post: Post; html: string; nav: { prev: NavLink; next: NavLink } };
  } = $props();

  let activeId = $state<string | null>(null);

  let meta: { title?: string; creator?: string; license?: string; licenseShort?: string; dataMiningFull?: string; unifiedId?: string; _links?: { raw?: string } } | null = $state(null);

  $effect(() => {
    if (!data.post?.headerImage?.url) return;
    const id = data.post.headerImage.url.match(/u\.macula\.link\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!id) return;
    const ctrl = new AbortController();
    fetch(`https://u.macula.link/${id}.json`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) meta = j; })
      .catch(() => {});
    return () => ctrl.abort();
  });

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parts.length > 2 ? parseInt(parts[2]) : undefined;
    const date = day ? new Date(year, month, day) : new Date(year, month);
    const options: Intl.DateTimeFormatOptions = day
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'long' };
    return date.toLocaleDateString('en-US', options);
  }

  function dateAttrib(dateStr: string | null): string {
    if (!dateStr) return '';
    return dateStr;
  }

  async function handleCopy(event: Event) {
    const target = event.target as HTMLElement;
    const btn = target.closest('[data-copy-btn]') as HTMLElement | null;
    if (!btn) return;

    const code = btn.dataset.code || '';
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied');
    } catch {
      // Clipboard not available — silently degrade
    }
  }

  // Track scroll position for active TOC heading
  $effect(() => {
    void data.html;

    const raf = requestAnimationFrame(() => {
      const headings = document.querySelectorAll<HTMLElement>('article h2, article h3');
      if (headings.length === 0) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter(e => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            activeId = visible[0].target.id;
          }
        },
        { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
      );

      headings.forEach(h => observer.observe(h));

      return () => observer.disconnect();
    });

    return () => cancelAnimationFrame(raf);
  });

  // Copy button setup
  $effect(() => {
    void data.html;

    const raf = requestAnimationFrame(() => {
      const pres = document.querySelectorAll<HTMLPreElement>('article pre');
      pres.forEach((pre, index) => {
        if (pre.querySelector('[data-copy-btn]')) return;

        const code = pre.querySelector('code');
        if (!code?.textContent) return;

        pre.style.position = 'relative';

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.dataset.copyBtn = String(index);
        btn.dataset.code = code.textContent;
        btn.setAttribute('aria-label', 'Copy code to clipboard');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        btn.addEventListener('click', handleCopy);
        pre.appendChild(btn);
      });
    });

    return () => cancelAnimationFrame(raf);
  });
</script>

<Seo
  title="{data.post.title} · woss.io"
  description={data.post.excerpt}
  image={data.post.headerImage?.url ?? `https://woss.io/api/og/${page.params.slug}.png`}
  type="article"
  publishedTime={data.post.date}
  tags={data.post.tags}
/>

<!-- Skip to content link -->
<a href="#main-content" class="absolute -top-full left-4 px-4 py-2 bg-primary text-surface text-sm font-semibold rounded-md z-200 transition-all duration-150 focus:top-4">Skip to content</a>

<section class="pt-10 pb-24 overflow-x-hidden">
  <div class="container max-w-6xl mx-auto px-4">
    <a href={resolve('/posts')} class="mb-4 font-mono text-sm text-on-surface-variant no-underline cursor-pointer transition-colors duration-200 hover:text-primary">← Back to posts</a>
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-6 xl:gap-10">

    <!-- Content column -->
    <div class="flex flex-col gap-6">
    <article id="main-content" class="bg-surface-container border border-[rgba(255,255,255,0.08)] rounded-lg overflow-hidden p-4 md:p-6 lg:p-8">
      {#if data.post.headerImage}
        <figure class="relative m-0 mb-10 -mx-[17px] md:-mx-[25px] lg:-mx-[33px] -mt-[17px] md:-mt-[25px] lg:-mt-[33px]">
          {#if data.post.headerImage.url.includes('u.macula.link')}
            {@const base = data.post.headerImage.url.split('?')[0]}
            <picture class="block">
              <source media="(max-width: 480px)" srcset={base + '?preset=sys_sm'} />
              <source media="(max-width: 768px)" srcset={base + '?preset=sys_md'} />
              <source media="(max-width: 1024px)" srcset={base + '?preset=sys_lg'} />
              <img src={base + '?preset=sys_xl'} alt={data.post.headerImage.alt} class="w-full object-cover aspect-2/1" loading="eager" />
            </picture>
          {:else}
            <img src={data.post.headerImage.url} alt={data.post.headerImage.alt} class="w-full object-cover aspect-2/1" loading="eager" />
          {/if}
          {#if meta}
            <ImageAttribution
              title={meta.title ?? data.post.headerImage.alt}
              creator={meta.creator}
              license={meta.licenseShort ?? meta.license}
              dataMining={meta.dataMiningFull}
              maculaUrl={meta._links?.raw ? `https://macula.link/${meta.unifiedId}` : ''}
            />
          {/if}
        </figure>
      {:else}
        <figure class="relative m-0 mb-10 -mx-[17px] md:-mx-[25px] lg:-mx-[33px] -mt-[17px] md:-mt-[25px] lg:-mt-[33px]">
          <img src={`/api/og/${data.post.slug}.png`} alt={data.post.title} class="w-full object-cover aspect-2/1" loading="lazy" />
        </figure>
      {/if}

      <header class="mb-12">
        <h1 class="font-heading text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-[-0.03em] m-0 mb-4 text-white">{data.post.title}</h1>
        <div class="flex items-center gap-4 flex-wrap mb-6">
          {#if data.post.date}
            <time datetime={dateAttrib(data.post.date)} class="text-sm text-on-surface-variant font-mono tracking-[0.02em]">
              {formatDate(data.post.date)}
            </time>
          {/if}
          {#if data.post.tags.length > 0}
            <ul class="flex flex-wrap gap-2 list-none p-0 m-0" aria-label="Tags">
              {#each data.post.tags as tag (tag)}
                <li class="inline-block px-3 py-1 text-xs font-mono text-secondary bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)] rounded-full tracking-[0.03em] uppercase">{tag}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div class="h-0.5 bg-[linear-gradient(90deg,var(--color-primary),var(--color-secondary))] rounded-[1px] my-8" aria-hidden="true"></div>
      </header>

      <div class="overflow-x-auto prose prose-invert max-w-none">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html data.html}
      </div>

      <div class="h-[2px] bg-[linear-gradient(90deg,var(--color-primary),var(--color-secondary))] rounded-[1px] my-8" aria-hidden="true"></div>

      {#if data.post.date}
        <p class="text-sm text-on-surface-variant font-mono m-0 mb-4">
          Published <time datetime={dateAttrib(data.post.date)}>{formatDate(data.post.date)}</time>
        </p>
      {/if}

      {#if data.nav.prev || data.nav.next}
        <nav class="grid grid-cols-2 gap-4 my-6" aria-label="Adjacent posts">
          {#if data.nav.prev}
            <a href={resolve('/posts/[slug]', { slug: data.nav.prev.slug })} class="inline-flex items-center p-4 border border-[rgba(255,255,255,0.08)] rounded-md no-underline transition-all duration-200 hover:border-primary hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] text-secondary font-mono text-xs uppercase tracking-[0.08em]">
              &larr; Previous
            </a>
          {:else}
            <div></div>
          {/if}
          {#if data.nav.next}
            <a href={resolve('/posts/[slug]', { slug: data.nav.next.slug })} class="inline-flex items-center justify-end p-4 border border-[rgba(255,255,255,0.08)] rounded-md no-underline transition-all duration-200 hover:border-primary hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] text-secondary font-mono text-xs uppercase tracking-[0.08em]">
              Next &rarr;
            </a>
          {/if}
        </nav>
      {/if}

    </article>
    </div>

    <!-- TOC sidebar column -->
    <aside class="hidden lg:block self-start">
      <nav class="sticky top-24 space-y-1 border-l border-[rgba(255,255,255,0.08)] pl-4" aria-label="Table of contents">
        <span class="block text-xs font-mono font-semibold text-on-surface-variant uppercase tracking-[0.06em] mb-3">On this page</span>
        {#each data.post.toc as entry (entry.id)}
          <a
            href={"#" + entry.id}
            class="block text-sm leading-snug transition-all duration-150 no-underline {entry.level === 3 ? 'pl-4' : ''} {activeId === entry.id ? 'text-primary font-medium' : 'text-on-surface-variant hover:text-on-surface'}"
          >
            {entry.text}
          </a>
        {/each}
      </nav>
    </aside>

    </div>
  </div>
</section>

<style>
  :global(.copy-btn) {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 1;
    cursor: pointer;
    padding: 0.4rem;
    border: none;
    background: transparent;
    color: inherit;
    line-height: 0;
    border-radius: 4px;
    transition: opacity 0.15s;
    opacity: 0.7;
  }
  :global(.copy-btn:hover) {
    opacity: 1;
  }
</style>

