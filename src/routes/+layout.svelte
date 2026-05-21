<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { showMobileSidebar } from '$lib/stores/mobile-sidebar';


  import '../app.css';
  import { Toaster } from 'svelte-sonner';

  let { children } = $props();

  let mobileMenuOpen = $state(false);
  let previousFocus: HTMLElement | null = null;

  const navLinks = [
    { href: '/', label: 'Ask' },
    { href: '/experience', label: 'Experience' },
    { href: '/posts', label: 'Posts' },
    { href: '/about', label: 'About' }
  ] as const;

  function isActive(href: string): boolean {
    if (href === '/') return page.url.pathname === '/';
    return page.url.pathname.startsWith(href);
  }

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
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  <link rel="icon" href="https://u.macula.link/@woss/avatar" />
  <link rel="apple-touch-icon" href="https://u.macula.link/@woss/avatar" />
</svelte:head>

<nav
  aria-label="Main navigation"
  class="fixed top-0 left-0 right-0 h-(--nav-height) z-200 bg-surface/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.08)]"
>
  <div class="flex items-center justify-between h-full mx-auto px-8 max-md:px-4">
    <a
      href={resolve('/')}
      class="font-heading text-xl font-bold text-primary no-underline tracking-[-0.02em] hover:text-white transition-colors duration-150"
    >
      woss.io
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
      class="md:hidden flex items-center justify-center w-10 h-10 p-0 border border-[rgba(255,255,255,0.08)] rounded-md bg-transparent text-on-surface-variant cursor-pointer hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors duration-150"
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

<div
  class="fixed inset-0 z-300 bg-surface flex flex-col items-center justify-center gap-8 transition-all duration-250 md:hidden"
  style="opacity: {mobileMenuOpen ? 1 : 0}; pointer-events: {mobileMenuOpen ? 'auto' : 'none'}; transform: translateY({mobileMenuOpen ? '0px' : '-12px'});"
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
    class="absolute top-5 right-4 flex items-center justify-center w-10 h-10 p-0 border border-[rgba(255,255,255,0.08)] rounded-md bg-transparent text-on-surface-variant cursor-pointer hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors duration-150"
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
      {#if page.url.pathname === '/' || page.url.pathname.startsWith('/chat/')}
        <button
          onclick={() => {
            closeMobileMenu();
            showMobileSidebar.set(true);
          }}
          class="no-underline font-heading text-3xl font-bold tracking-[-0.02em] text-on-surface-variant hover:text-white transition-colors duration-150 cursor-pointer bg-transparent border-0"
        >
          Chats
        </button>
      {/if}
    </div>
  </div>

<Toaster />

<main class="pt-(--nav-height) mx-auto min-h-screen">
  {@render children()}
</main>
