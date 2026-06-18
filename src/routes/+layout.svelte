<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { appendQueryParams } from '$lib/utils/utm';
  import { Toaster } from 'svelte-sonner';
  import { Button, Drawer } from 'sv5ui';

  import '../app.css';

  // Font @font-face declarations (font-display: swap — mitigated by preload)
  import '@fontsource-variable/ibm-plex-sans';
  import '@fontsource-variable/ibm-plex-sans/wght-italic.css';
  import '@fontsource/ibm-plex-mono/400.css';
  import '@fontsource/ibm-plex-mono/700.css';

  // Font WOFF2 URLs for preload hints in <svelte:head>
  import ibmPlexSansNormal from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url';
  import ibmPlexSansItalic from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-italic.woff2?url';
  import ibmPlexMono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
  import ibmPlexMono700 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?url';

  let avatarUrl = $derived(appendQueryParams('https://u.macula.link/@woss/avatar', page.data.queryParams));

  let { children } = $props();

  let mobileMenuOpen = $state(false);
  const navLinks = [
    { href: '/', label: 'Ask' },
    { href: '/experience', label: 'Experience' },
    { href: '/posts', label: 'Posts' },
    { href: '/about', label: 'About' },
  ] as const;

  function isActive(href: string): boolean {
    if (href === '/') return page.url.pathname === '/';
    return page.url.pathname.startsWith(href);
  }

  let isChatPage = $derived(page.url.pathname.startsWith('/chat/'));

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  // Close mobile menu on route navigation
  $effect(() => {
    void page.url.pathname;
    mobileMenuOpen = false;
  });
</script>

<svelte:head>
  <link rel="icon" href={avatarUrl} />
  <link rel="apple-touch-icon" href={avatarUrl} />
  <link rel="preload" href={ibmPlexSansNormal} as="font" crossorigin="anonymous" type="font/woff2" />
  <link rel="preload" href={ibmPlexSansItalic} as="font" crossorigin="anonymous" type="font/woff2" />
  <link rel="preload" href={ibmPlexMono400} as="font" crossorigin="anonymous" type="font/woff2" />
  <link rel="preload" href={ibmPlexMono700} as="font" crossorigin="anonymous" type="font/woff2" />
</svelte:head>

{#if !isChatPage}
  <nav
    aria-label="Main navigation"
    class="fixed top-0 inset-x-0 h-(--nav-height) z-200 {isChatPage
      ? 'bg-transparent backdrop-blur-none border-b-0'
      : 'bg-surface/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.08)] max-md:bg-transparent max-md:backdrop-blur-none max-md:border-b-0'}"
    style="transition: transform 300ms ease-out;"
  >
    <div class="flex items-center justify-between h-full mx-auto px-8 max-md:px-4">
      <a
        href={resolve('/')}
        class="font-heading text-xl font-bold text-primary no-underline tracking-[-0.02em] hover:text-white transition-colors duration-150"
      >
        <img src={avatarUrl} alt="woss.io logo" width="32" height="32" class="size-8" />
      </a>

      <div class="hidden md:flex items-center gap-8">
        {#each navLinks as link (link.href)}
          <a
            href={resolve(link.href)}
            class="text-on-surface-variant no-underline font-body text-sm font-medium tracking-[0.04em] uppercase py-1 hover:text-white transition-colors duration-150 border-b-2 border-transparent"
            class:text-primary={isActive(link.href)}
            class:border-primary={isActive(link.href)}
          >
            {link.label}
          </a>
        {/each}
      </div>

      <Button
        variant="outline" square size="md"
        aria-label="Toggle menu"
        aria-expanded={mobileMenuOpen}
        onclick={() => (mobileMenuOpen = true)}
        class="md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </Button>
    </div>
  </nav>

  <!-- Mobile menu drawer -->
  <Drawer
    bind:open={mobileMenuOpen}
    direction="top"
    overlay
    modal
    dismissible
    handle={false}
    noBodyStyles
  >
    {#snippet body()}
      <div class="flex flex-col items-center justify-center gap-12 min-h-[50vh] pt-16 pb-24">
        {#each navLinks as link (link.href)}
          <a
            href={resolve(link.href)}
            class="no-underline font-heading text-3xl font-bold tracking-[-0.02em] text-on-surface-variant hover:text-white transition-colors duration-150"
            class:text-primary={isActive(link.href)}
          >
            {link.label}
          </a>
        {/each}
        <Button
          variant="ghost"
          onclick={() => {
            closeMobileMenu();
            goto(resolve('/chat'));
          }}
          class="font-heading text-3xl font-bold tracking-[-0.02em] text-on-surface-variant hover:text-white [&>button]:text-inherit [&>button]:text-3xl"
        >
          Chats
        </Button>
      </div>
    {/snippet}
  </Drawer>
{/if}

<Toaster />

<main class="mx-auto min-h-screen" style="padding-top: {isChatPage ? '0px' : 'var(--nav-height)'}">
  {@render children()}
</main>
