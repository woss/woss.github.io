<script lang="ts">
  let { data } = $props();

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Banner } from 'sv5ui';
  import { parse } from 'devalue';
  import Seo from '$lib/components/Seo.svelte';

  const USER_ID_KEY = 'woss-io_user-id';
  const MAX_CHARS = 500;

  import ChatSidebar from '$lib/components/ChatSidebar.svelte';
  import HomeChatInput from '$lib/components/HomeChatInput.svelte';
  import { config } from '$lib/config';
  import { showMobileSidebar } from '$lib/stores/mobile-sidebar';
  import ContactForm from '$lib/components/ContactForm.svelte';
  import { randomUUID } from '$lib/utils/random-uuid';

  let userId = $state('');
  let messageText = $state('');
  let isLoading = $state(false);
  let inputEl: HTMLTextAreaElement | undefined = $state();

  interface Chat {
    id: string;
    userId: string;
    title: string;
    createdAt: string;
    messageCount: number;
  }

  let chats = $state<Chat[]>([]);
  let showDeleteConfirm = $state<string | null>(null);
  let deleting = $state(false);
  let hasChats = $derived(chats.length > 0);
  let canCreateChat = $derived(chats.length < config.public.maxChats);

  // Contact form state
  let contactName = $state('');
  let contactEmail = $state('');
  let contactMessage = $state('');
  let contactCompany = $state('');
  let contactRole = $state('');
  let contactSubmitting = $state(false);
  let contactSubmitted = $state(false);
  let contactError = $state('');
  let featuredReady = $state(false);
  let showContactFormInline = $state(false);
  let ready = $state(false);

  let qp = $derived(page.data.queryParams);

  function confirmDeleteChat(chatId: string): void {
    showDeleteConfirm = chatId;
  }

  async function deleteChat(chatId: string): Promise<void> {
    if (deleting) return;
    deleting = true;
    showDeleteConfirm = null;
    if (!userId) return;
    try {
      const fd = new FormData();
      fd.set('userId', userId);
      fd.set('chatId', chatId);
      const res = await fetch('?/delete', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (body.type !== 'failure') {
        chats = chats.filter(c => c.id !== chatId);
      }
    } catch { /* ignore */ }
    deleting = false;
  }

  function enhanceContact({ formData, cancel }: {
    formData: FormData;
    action: URL;
    cancel: () => void;
    submitter: HTMLElement | null;
  }): void | ((args: { result: { type: string; data?: Record<string, unknown>; status?: number }; update: () => void }) => void) {
    const name = formData.get('name')?.toString().trim() || '';
    const email = formData.get('email')?.toString().trim() || '';

    // Client-side validation before submit
    contactError = '';
    if (!name || !email) {
      contactError = 'Name and email are required.';
      cancel();
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      contactError = 'Please enter a valid email address.';
      cancel();
      return;
    }

    // Inject userId into form data
    if (userId) {
      formData.set('userId', userId);
    }

    contactSubmitting = true;

    return async ({ result, update }) => {
      contactSubmitting = false;
      if (result.type === 'success' && result.data?.success) {
        contactSubmitted = true;
      } else {
        const data = result.type === 'success' ? result.data : null;
        contactError = (data?.error as string) || 'Something went wrong. Try again later.';
      }
      await update();
    };
  }

  $effect(() => {
    if (!browser) return;
    try {
      const stored = localStorage.getItem(USER_ID_KEY);
      if (stored) {
        userId = stored;
      } else {
        const id = randomUUID();
        localStorage.setItem(USER_ID_KEY, id);
        userId = id;
      }
    } catch {
      userId = randomUUID();
    }
  });

  onMount(() => {
    if (!userId) return;
    fetch(`/api/chat?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => {
        chats = (data.chats as Chat[]) || [];
        ready = true;
      })
      .catch(() => { chats = []; ready = true; });
  });

  // Listen for nav menu requesting sidebar open
  $effect(() => {
    if (!browser) return;
    function handler() { showMobileSidebar.set(true); }
    window.addEventListener('open-chat-sidebar', handler);
    return () => window.removeEventListener('open-chat-sidebar', handler);
  });

  onMount(() => {
    featuredReady = true;
  });

  $effect(() => {
    if (showContactFormInline) {
      setTimeout(() => {
        const el = document.querySelector('[data-contact-form]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  });

  function handleSuggestedClick(question: string): void {
    messageText = question;
    sendMessage(question);
  }

  async function sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || isLoading || trimmed.length > MAX_CHARS || !userId) return;

    isLoading = true;

    try {
      // Create chat first, then navigate with message as query param
      const fd = new FormData();
      fd.set('userId', userId);
      const res = await fetch('?/create', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      const body = await res.json().catch(() => ({}));
      const actionData = body.data != null ? parse(body.data) : {};
      if (body.type === 'failure' || !actionData.id) {
        isLoading = false;
        return;
      }
      const chatId = actionData.id as string;
      await goto(resolve(`/chat/${chatId}`), { state: { q: trimmed } });
    } catch {
      isLoading = false;
    }
  }

  async function createChat(): Promise<void> {
    if (!canCreateChat || !userId) return;
    try {
      const fd = new FormData();
      fd.set('userId', userId);
      const res = await fetch('?/create', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      const body = await res.json().catch(() => ({}));
      const actionData = body.data != null ? parse(body.data) : {};
      if (body.type !== 'failure' && actionData.id) {
        goto(resolve(`/chat/${actionData.id}`));
      }
    } catch { /* ignore */ }
  }
</script>

<Seo title="woss.io — Ask me anything" description="Personal site of @woss — AI-powered chat and blog" />

<div class="relative overflow-hidden min-h-[calc(100vh-var(--nav-height)-3rem)]">
{#if ready}
{#if hasChats}
<div class="relative z-2 flex min-h-[calc(100vh-var(--nav-height)-3rem)] max-md:px-4">
  <ChatSidebar {chats} {canCreateChat} {showDeleteConfirm} bind:showMobile={$showMobileSidebar} oncreateChat={createChat} onconfirmDeleteChat={confirmDeleteChat} ondeleteChat={deleteChat} oncancelDelete={() => showDeleteConfirm = null} />

  <div class="flex flex-col flex-1 min-w-0">
    {#if data?.hero}
    <div class="w-full max-w-200 mx-auto pt-2 pb-1">
      <Banner title={data.hero.title} icon="lucide:sparkles" color="primary" to={resolve('/posts/new-woss-io')} class="rounded-lg" />
    </div>
    {/if}

    {#if canCreateChat}
    <!-- Original input area -->
    <main class="flex-1 flex flex-col items-center gap-6 max-md:gap-4 pt-9">
      <!-- Hero + Input -->
      <div class="w-full flex flex-col items-center gap-6">
        <div class="w-full max-w-200 flex flex-col gap-5">
          <HomeChatInput bind:messageText bind:isLoading bind:inputEl onsend={sendMessage} onsuggested={handleSuggestedClick} />
        </div>
      </div>

      <!-- Featured posts -->
      {#if featuredReady && data?.featuredPosts?.length}
      <div class="w-full max-w-200 pt-2">


        <div class="flex flex-col gap-3">
          <h2 class="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider m-0">Featured Posts</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            {#each (data?.featuredPosts ?? []).slice(-3) as post (post.slug)}
              <a
                href={resolve('/posts/[slug]', { slug: post.slug })}
                class="flex flex-col gap-2 rounded-xl bg-surface-container-high border border-[rgba(255,255,255,0.06)] p-4 no-underline transition-all duration-150 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(0,255,136,0.06)] hover:-translate-y-0.5"
              >
                {#if post.headerImage}
                  <div class="w-full aspect-video rounded-lg overflow-hidden bg-surface-container">
                    <img src={post.headerImage.url} alt={post.headerImage.alt} class="w-full h-full object-cover" />
                  </div>
                {/if}
                <div class="flex flex-col gap-1 min-w-0">
                  <h3 class="font-body text-sm font-semibold text-on-surface m-0 line-clamp-2">{post.title}</h3>
                  {#if post.description}
                    <p class="font-body text-xs text-on-surface-variant m-0 line-clamp-2">{post.description}</p>
                  {/if}
                  <div class="flex items-center gap-2 mt-1">
                    {#if post.date}
                      <span class="font-mono text-[10px] text-on-surface-variant">{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {/if}
                    {#each post.tags.slice(0, 2) as tag (tag)}
                      <span class="font-mono text-[10px] text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-full">{tag}</span>
                    {/each}
                  </div>
                </div>
              </a>
            {/each}
          </div>
        </div>
      </div>
      {/if}
    </main>
    {:else}
    <!-- Contact form when chats exhausted -->
    <main class="flex-1 flex flex-col items-center justify-center gap-8 max-md:gap-6 px-4">
      <div class="w-full max-w-[420px] flex flex-col items-center gap-6">
        <!-- Card wrapper -->
        <div class="w-full rounded-2xl bg-surface-container-high border border-[rgba(255,255,255,0.06)] p-8 max-md:p-6 flex flex-col items-center gap-6">
          <div class="text-center">
            <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p class="font-heading text-xl text-on-surface m-0">No more chats available!</p>
            <p class="font-body text-sm text-on-surface-variant mt-2 m-0 max-w-[320px] mx-auto">It seems you are interested in my work. Drop your details and I'll get back to you.</p>
          </div>

          {#if contactSubmitted}
            <div class="flex flex-col items-center gap-4 text-center">
              <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p class="font-heading text-lg text-on-surface m-0">Thank you!</p>
                <p class="font-body text-sm text-on-surface-variant mt-1">I'll get back to you soon.</p>
              </div>
              <p class="font-body text-xs text-on-surface-variant">Feel free to continue chatting in existing conversations.</p>
            </div>
          {:else}
            <form method="POST" action="?/contact" use:enhance={enhanceContact} class="w-full flex flex-col gap-3">
              <input type="hidden" name="userId" value={userId} />
              <input
                type="text" name="name" placeholder="Your name*"
                bind:value={contactName}
                class="w-full font-body text-sm text-on-surface bg-surface border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 outline-none transition-all duration-150 placeholder:text-on-surface-variant/60 focus:border-primary focus:shadow-[0_0_0_1px_var(--color-primary),0_0_16px_rgba(0,255,136,0.12)]"
                maxlength="100" required disabled={contactSubmitting}
              />
              <input
                type="email" name="email" placeholder="Your email*"
                bind:value={contactEmail}
                class="w-full font-body text-sm text-on-surface bg-surface border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 outline-none transition-all duration-150 placeholder:text-on-surface-variant/60 focus:border-primary focus:shadow-[0_0_0_1px_var(--color-primary),0_0_16px_rgba(0,255,136,0.12)]"
                maxlength="200" required disabled={contactSubmitting}
              />
              <input
                type="text" name="companyName" placeholder="Company name (optional)"
                bind:value={contactCompany}
                class="w-full font-body text-sm text-on-surface bg-surface border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 outline-none transition-all duration-150 placeholder:text-on-surface-variant/60 focus:border-primary focus:shadow-[0_0_0_1px_var(--color-primary),0_0_16px_rgba(0,255,136,0.12)]"
                maxlength="200" disabled={contactSubmitting}
              />
              <input
                type="text" name="role" placeholder="Role / description (optional)"
                bind:value={contactRole}
                class="w-full font-body text-sm text-on-surface bg-surface border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 outline-none transition-all duration-150 placeholder:text-on-surface-variant/60 focus:border-primary focus:shadow-[0_0_0_1px_var(--color-primary),0_0_16px_rgba(0,255,136,0.12)]"
                maxlength="200" disabled={contactSubmitting}
              />
              <textarea
                name="message" placeholder="Short message (optional)"
                bind:value={contactMessage}
                class="w-full font-body text-sm text-on-surface bg-surface border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 min-h-[72px] max-h-[144px] resize-none outline-none transition-all duration-150 placeholder:text-on-surface-variant/60 focus:border-primary focus:shadow-[0_0_0_1px_var(--color-primary),0_0_16px_rgba(0,255,136,0.12)]"
                maxlength="1000" rows="3" disabled={contactSubmitting}
              ></textarea>

              {#if contactError}
                <p class="font-body text-xs text-secondary m-0">{contactError}</p>
              {/if}

              <button
                type="submit"
                disabled={contactSubmitting}
                class="w-full font-body text-sm font-semibold text-surface bg-primary rounded-xl px-6 py-3 mt-1 cursor-pointer transition-all duration-150 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
              >
                {#if contactSubmitting}
                  <span class="inline-flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-surface animate-pulse-send"></span>
                    Sending...
                  </span>
                {:else}
                  Send Message
                {/if}
              </button>
            </form>
          {/if}
        </div>
      </div>
    </main>
      <!-- Featured posts -->
      {#if featuredReady && data?.featuredPosts?.length}
      <div class="w-full max-w-200 pt-2 mx-auto">


        <div class="flex flex-col gap-3">
          <h2 class="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider m-0">Featured Posts</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            {#each (data?.featuredPosts ?? []).slice(-3) as post (post.slug)}
              <a
                href={resolve('/posts/[slug]', { slug: post.slug })}
                class="flex flex-col gap-2 rounded-xl bg-surface-container-high border border-[rgba(255,255,255,0.06)] p-4 no-underline transition-all duration-150 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(0,255,136,0.06)] hover:-translate-y-0.5"
              >
                {#if post.headerImage}
                  <div class="w-full aspect-video rounded-lg overflow-hidden bg-surface-container">
                    <img src={post.headerImage.url} alt={post.headerImage.alt} class="w-full h-full object-cover" />
                  </div>
                {/if}
                <div class="flex flex-col gap-1 min-w-0">
                  <h3 class="font-body text-sm font-semibold text-on-surface m-0 line-clamp-2">{post.title}</h3>
                  {#if post.description}
                    <p class="font-body text-xs text-on-surface-variant m-0 line-clamp-2">{post.description}</p>
                  {/if}
                  <div class="flex items-center gap-2 mt-1">
                    {#if post.date}
                      <span class="font-mono text-[10px] text-on-surface-variant">{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {/if}
                    {#each post.tags.slice(0, 2) as tag (tag)}
                      <span class="font-mono text-[10px] text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-full">{tag}</span>
                    {/each}
                  </div>
                </div>
              </a>
            {/each}
          </div>
        </div>
      </div>
      {/if}
    {/if}
  </div>
</div>
{:else}
{#if data?.hero}
<div class="relative z-[2] w-full px-8 max-md:px-4 pt-2 pb-0">
  <div class="w-full max-w-200 mx-auto">
    <Banner title={data.hero.title} icon="lucide:sparkles" color="primary" to={resolve('/posts/new-woss-io')} class="rounded-lg" />
  </div>
</div>
{/if}
<div class="relative z-2 flex flex-col items-center min-h-[calc(100vh-var(--nav-height)-3rem)] gap-4 px-8 max-md:px-4 max-md:gap-4">
  <!-- Hero + Input -->
  <div class="w-full flex flex-col items-center gap-6">
    <div class="w-full max-w-200 flex flex-col gap-5">
      <HomeChatInput bind:messageText bind:isLoading bind:inputEl onsend={sendMessage} onsuggested={handleSuggestedClick} />
    </div>
  </div>

  <!-- Featured posts -->
  {#if featuredReady && data?.featuredPosts?.length}
  <div class="w-full max-w-200 pt-2">


    <div class="flex flex-col gap-3">
      <h2 class="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider m-0">Featured Posts</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        {#each (data?.featuredPosts ?? []).slice(-3) as post (post.slug)}
          <a
            href={resolve('/posts/[slug]', { slug: post.slug })}
            class="flex flex-col gap-2 rounded-xl bg-surface-container-high border border-[rgba(255,255,255,0.06)] p-4 no-underline transition-all duration-150 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(0,255,136,0.06)] hover:-translate-y-0.5"
          >
            {#if post.headerImage}
              <div class="w-full aspect-[16/9] rounded-lg overflow-hidden bg-surface-container">
                <img src={post.headerImage.url} alt={post.headerImage.alt} class="w-full h-full object-cover" />
              </div>
            {/if}
            <div class="flex flex-col gap-1 min-w-0">
              <h3 class="font-body text-sm font-semibold text-on-surface m-0 line-clamp-2">{post.title}</h3>
              {#if post.description}
                <p class="font-body text-xs text-on-surface-variant m-0 line-clamp-2">{post.description}</p>
              {/if}
              <div class="flex items-center gap-2 mt-1">
                {#if post.date}
                  <span class="font-mono text-[10px] text-on-surface-variant">{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {/if}
                {#each post.tags.slice(0, 2) as tag (tag)}
                  <span class="font-mono text-[10px] text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-full">{tag}</span>
                {/each}
              </div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </div>
  {/if}
</div>
{/if}
{:else}
<div class="relative z-[2]"></div>
{/if}

  {#if showContactFormInline}
    <div data-contact-form class="relative z-[2] w-full max-w-[420px] mx-auto px-8 pb-8 max-md:px-4">
      <ContactForm
        bind:showContactForm={showContactFormInline}
        {userId}
        chatId=""
        contactDismissed={false}
      />
    </div>
  {/if}
</div>


