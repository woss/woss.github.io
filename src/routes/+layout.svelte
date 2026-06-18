<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { appendQueryParams } from '$lib/utils/utm';
  import { Toaster } from 'svelte-sonner';

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
  let previousFocus: HTMLElement | null = null;
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

  function toggleMobileMenu() {
    if (!mobileMenuOpen) {
      previousFocus = document.activeElement as HTMLElement;
    }
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeMobileMenu();
      return;
    }
    if (e.key === 'Tab') {
      const overlay = e.currentTarget as HTMLElement;
      const focusable = overlay.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Close mobile menu on route navigation
  $effect(() => {
    void page.url.pathname;
    mobileMenuOpen = false;
  });

  // Lock body scroll when mobile menu is open
  $effect(() => {
    if (mobileMenuOpen) {
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
    };
  });

  // Focus management for mobile menu
  $effect(() => {
    if (mobileMenuOpen) {
      requestAnimationFrame(() => {
        const link = document.querySelector<HTMLAnchorElement>('[role="dialog"] a');
        link?.focus();
      });
    } else if (previousFocus) {
      previousFocus.focus();
      previousFocus = null;
    }
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

      <button
        class="md:hidden flex items-center justify-center size-10 p-0 border border-[rgba(255,255,255,0.08)] rounded-md bg-transparent text-on-surface-variant cursor-pointer hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors duration-150"
        aria-label="Toggle menu"
        aria-expanded={mobileMenuOpen}
        onclick={toggleMobileMenu}
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
      </button>
    </div>
  </nav>

  <!-- Mobile menu overlay (only when nav is visible) -->
  <div
    class="fixed inset-0 z-300 bg-surface flex flex-col items-center justify-center gap-8 transition-all duration-250 md:hidden"
    style="opacity: {mobileMenuOpen ? 1 : 0}; pointer-events: {mobileMenuOpen
      ? 'auto'
      : 'none'}; transform: translateY({mobileMenuOpen ? '0px' : '-12px'});"
    role="dialog"
    aria-modal="true"
    aria-label="Navigation menu"
    tabindex="-1"
    onkeydown={handleOverlayKeydown}
    onclick={(e) => {
      if (e.target === e.currentTarget) closeMobileMenu();
    }}
  >
    <button
      class="absolute top-5 right-4 flex items-center justify-center size-10 p-0 border border-[rgba(255,255,255,0.08)] rounded-md bg-transparent text-on-surface-variant cursor-pointer hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors duration-150"
      aria-label="Close menu"
      onclick={closeMobileMenu}
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
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>

    <div class="flex flex-col items-center gap-12">
      {#each navLinks as link (link.href)}
        <a
          href={resolve(link.href)}
          class="no-underline font-heading text-3xl font-bold tracking-[-0.02em] text-on-surface-variant hover:text-white transition-colors duration-150"
          class:text-primary={isActive(link.href)}
        >
          {link.label}
        </a>
      {/each}
      <button
        onclick={() => {
          closeMobileMenu();
          goto(resolve('/chat'));
        }}
        class="no-underline font-heading text-3xl font-bold tracking-[-0.02em] text-on-surface-variant hover:text-white transition-colors duration-150 cursor-pointer bg-transparent border-0"
      >
        Chats
      </button>
    </div>
  </div>
{/if}

<Toaster />

<main class="mx-auto min-h-screen" style="padding-top: {isChatPage ? '0px' : 'var(--nav-height)'}">
  {@render children()}
</main>
