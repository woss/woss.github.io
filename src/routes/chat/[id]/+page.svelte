<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { config } from '$lib/config';
  import { showMobileSidebar } from '$lib/stores/mobile-sidebar';
  import { parse } from 'devalue';
  import ChatSidebar from '$lib/components/ChatSidebar.svelte';
  import SuggestedQuestions from '$lib/components/SuggestedQuestions.svelte';
  import MsgCard from '$lib/components/ChatMessage.svelte';
  import ContactForm from '$lib/components/ContactForm.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import { toast } from 'svelte-sonner';
  import { playPluckSound } from '$lib/utils/sounds';
  import SoundToggle from '$lib/components/SoundToggle.svelte';

  import type { ChatMessage, Chat, ToolCallInfo } from '$lib/chat/types';
  import { sendChatMessage } from '$lib/chat/send';


  let { data } = $props() as { data: { messages: ChatMessage[], locked: boolean } };

  /* ─── Constants ─── */

  const USER_ID_KEY = 'woss-io_user-id';

  const ORIGINAL_FAV_HREF = 'https://u.macula.link/@woss/avatar';
  const LOADING_FAV_SVG = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="#1a1a2e"/>
      <circle cx="16" cy="16" r="5" fill="#22c55e">
        <animate attributeName="opacity" values="1;0.2;1" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite"/>
      </circle>
    </svg>`
  );
  const LOADING_FAVICON = `data:image/svg+xml,${LOADING_FAV_SVG}`;

  /* ─── Route params ─── */

  let chatId = $derived((page.params as { id: string }).id);
  let queryText = $state('');

  /* ─── State ─── */

  let userId = $state('');
  let messages: ChatMessage[] = $state((() => data?.messages ?? [])()) as ChatMessage[];
  let messageText = $state('');
  let isLoading = $state(false);
  let lastSentText = $state('');
  let inputEl: HTMLTextAreaElement | undefined = $state();
  let messageListEl: HTMLDivElement | undefined = $state();
  let stickToBottom = $state(true);
  let bottomSentinelEl: HTMLDivElement | undefined = $state();
  /* ─── Chat state ─── */

  // Capture SSR data at component init — page params are available here
  // svelte-ignore state_referenced_locally
  const ssrLocked = data.locked;
  // svelte-ignore state_referenced_locally
  const ssrChatId = (page.params as { id: string }).id;

  let chats = $state<Chat[]>(
    ssrLocked && ssrChatId
      ? [{ id: ssrChatId, userId: '', title: '', createdAt: '', messageCount: 0, locked: true }]
      : []
  );
  let currentChatId = $derived<string | null>(chatId || null);
  // Local binding proxy for ChatSidebar two-way binding (reacts to store changes)
  let showMobile = $state(false);
  $effect(() => {
    const unsub = showMobileSidebar.subscribe(v => showMobile = v);
    return unsub;
  });
  // Propagate local changes (from sidebar close via bind:) back to store
  $effect(() => {
    showMobileSidebar.set(showMobile);
  });

  // Pulse green-dot favicon while loading
  $effect(() => {
    if (isLoading) {
      const el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (el) {
        el.href = LOADING_FAVICON;
        return () => { el.href = ORIGINAL_FAV_HREF; };
      }
    }
  });

  let showDeleteConfirm = $state<string | null>(null);
  let deleting = $state(false);
  let showContactForm = $state(false);
  let contactDismissed = $state(false);

  /* ─── Tool call state ─── */

  let toolCallsMap = $state<Record<string, ToolCallInfo[]>>({});

  /* ─── Streaming state (SSE events) ─── */

  let streamingToolCalls = $state<Record<string, { id: string; name: string; serverId: string; startedAt: number; finishedAt?: number }>>({});
  let currentStatus = $state<string>('');
  let now = $state(Date.now());

  /* ─── Derived ─── */

  let hasMessages = $derived(messages.length > 0);
  let currentChat = $derived(chats.find((c) => c.id === currentChatId) ?? null);
  let currentChatTitle = $derived(currentChat?.title ?? '');
  let canSend = $derived(!isLoading && !currentChat?.locked && messageText.trim().length > 0 && messageText.length <= 500);

  let chatCount = $derived(chats.length);
  let canCreateChat = $derived(chatCount < config.public.maxChats);
  let userMessageCount = $derived(messages.filter(m => m.role === 'user').length);
  let maxMessagesReached = $derived(userMessageCount >= config.public.maxMessages);

  let streamingToolValues = $derived(Object.values(streamingToolCalls));
  let activeToolCount = $derived(streamingToolValues.filter(t => !t.finishedAt).length);
  let completedToolCount = $derived(streamingToolValues.filter(t => t.finishedAt).length);

  /* ─── Functions ─── */

  function focusInput(): void {
    inputEl?.focus();
  }

  async function loadChats(): Promise<void> {
    if (!userId) return;
    try {
      const res = await fetch(`/api/chat?userId=${userId}`);
      if (res.ok) {
        chats = (await res.json()).chats;
      }
    } catch {
      /* ignore */
    }
  }

  async function loadMessages(): Promise<void> {
    if (!chatId) return;
    stickToBottom = true;
    try {
      const res = await fetch(`/api/chat/${chatId}/messages`);
      if (res.ok) {
        const data = await res.json();

        // Guard: if server has no messages but local state already populated
        // (e.g. user sent a message before this fetch resolved), don't overwrite.
        if (data.messages.length === 0 && messages.length > 0 && isLoading) return;

        messages = data.messages.map((m: Record<string, unknown>) => ({
          id: m.id as string,
          role: m.role as 'user' | 'assistant',
          text: m.content as string,
          error: m.error as string | undefined,
          irrecoverable: m.irrecoverable as boolean | undefined,
          sources: m.sources ? JSON.parse(m.sources as string) : undefined,
          timestamp: new Date(m.createdAt as string).getTime() || Date.now(),
          createdAt: m.createdAt as string,
          modelId: (m.modelId as number) || 0,
          tokensIn: (m.tokensIn as number) || 0,
          tokensOut: (m.tokensOut as number) || 0,
          durationMs: (m.durationMs as number) || 0,
          deletedAt: m.deletedAt as string | undefined,
        }));

        // Load reactions for assistant messages in parallel
        const assistantMessages = messages.filter((msg) => msg.role === 'assistant');
        const reactionResults = await Promise.allSettled(assistantMessages.map((msg) => fetchReaction(msg.id)));
        for (let i = 0; i < assistantMessages.length; i++) {
          const result = reactionResults[i];
          if (result.status === 'fulfilled' && result.value) {
            assistantMessages[i].reaction = result.value;
            assistantMessages[i].savedReason = result.value.reason || '';
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  async function createChat(): Promise<void> {
    if (!canCreateChat || !userId) return;
    try {
      const fd = new FormData();
      fd.set('userId', userId);
      const res = await fetch('/chat?/create', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      const body = await res.json().catch(() => ({}));
      const actionData = body.data != null ? parse(body.data) : {};
      if (body.type !== 'failure' && actionData.id) {
        goto(resolve(`/chat/${actionData.id}`));
      }
    } catch {
      /* ignore */
    }
  }

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
        chats = chats.filter((c) => c.id !== chatId);
        if (currentChatId === chatId) {
          if (chats.length > 0) {
            goto(resolve(`/chat/${chats[0].id}`));
          } else {
            goto(resolve('/'));
          }
        }
      }
    } catch {
      /* ignore */
    }
    deleting = false;
  }

  async function sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500 || isLoading) return;
    if (userMessageCount >= config.public.maxMessages) return;
    if (!currentChatId) return;

    // Slash command: /contact — show form instantly, no AI call
    if (trimmed === '/contact' || trimmed.startsWith('/contact ')) {
      contactDismissed = false;
      if (browser) {
        try {
          const dismissed: string[] = JSON.parse(localStorage.getItem('contact_dismissed_chats') || '[]');
          const filtered = dismissed.filter((id: string) => id !== chatId);
          localStorage.setItem('contact_dismissed_chats', JSON.stringify(filtered));
        } catch {
          /* ignore */
        }
      }
      showContactForm = true;
      messageText = '';
      if (inputEl) inputEl.style.height = 'auto';
      // Log intent to server in background
      fetch('/api/leads/contact-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chatId: currentChatId }),
      }).catch(() => {});
      return;
    }

    // Slash command: /summarize — guard against empty conversations
    if (trimmed === '/summarize') {
      const hasUserMessages = messages.some(m => m.role === 'user');
      if (!hasUserMessages) {
        messageText = '';
        if (inputEl) inputEl.style.height = 'auto';
        // Don't add another playful message if one already exists
        const alreadyHasReply = messages.some(m => m.role === 'assistant' && m.text.length > 0 && !m.error);
        if (alreadyHasReply) return;
        const playfulReplies = [
          "You can't brew a potion from an empty cauldron! Toss in a question and let the magic begin.",
          'The void gazes back... and it\'s terribly boring. Say something before we both turn into spacetime dust.',
          'System online. Neural core ready. Input buffer... empty. Care to initiate first contact?',
          'Even a wizard needs words to weave with. What shall we conjure today?',
          "Beam me a query, Captain! This channel's running on empty — give me something to lock onto.",
          "The crystal ball's a bit foggy. Feed it a question and I'll divine an answer.",
          'This conversation is a black hole — all event horizon, no substance. Let\'s change that?',
          "42 is the answer to life, the universe, and everything... but what's your question?",
        ];
        const reply = playfulReplies[crypto.getRandomValues(new Uint32Array(1))[0] % playfulReplies.length];
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            text: reply,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
          },
        ];
        // Persist the playful reply to the server
        const fd = new FormData();
        fd.set('userId', userId);
        fd.set('role', 'assistant');
        fd.set('content', reply);
        fetch('?/store-message', { method: 'POST', body: fd }).catch(() => {});
        return;
      }
    }

    messageText = '';
    lastSentText = trimmed;
    isLoading = true;
    if (inputEl) inputEl.style.height = 'auto';

    const result = await sendChatMessage(trimmed, userId, currentChatId, messages);
    messages = result.messages;
    stickToBottom = true;

    if (result.locked && currentChatId) {
      chats = chats.map((c) => (c.id === currentChatId ? { ...c, locked: true } : c));
    }

    if (result.error) {
      isLoading = false;
    }
    // When accepted === true, isLoading stays true until SSE 'done' event
  }

  function retry(): void {
    if (lastSentText && !isLoading) {
      messages = messages.slice(0, -2);
      sendMessage(lastSentText);
    }
  }

  async function fetchToolCalls(messageId: string): Promise<void> {
    if (!messageId || toolCallsMap[messageId]) return;
    try {
      const res = await fetch(`/api/chat/${chatId}/messages/${messageId}/tool-calls`);
      if (res.ok) {
        const data = await res.json();
        toolCallsMap = { ...toolCallsMap, [messageId]: data.toolCalls };
      }
    } catch {
      /* ignore */
    }
  }

  async function fetchReaction(messageId: string): Promise<{ type: 'up' | 'down' | 'heart'; reason: string } | null> {
    try {
      const res = await fetch(`/api/messages/${messageId}/reaction?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        return data.reaction;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function handleReport(messageId: string): void {
    messages = messages.map((m) =>
      m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m,
    );
  }

  /* ─── Effects ─── */

  // Load userId from localStorage
  $effect(() => {
    if (!browser) return;
    try {
      const stored = localStorage.getItem(USER_ID_KEY);
      if (stored) {
        userId = stored;
      } else {
        const id = crypto.randomUUID();
        localStorage.setItem(USER_ID_KEY, id);
        userId = id;
      }
    } catch {
      userId = crypto.randomUUID();
    }
  });

  // Track dismissed chats — reactive to chatId changes
  $effect(() => {
    if (!browser || !chatId) return;
    try {
      const dismissed = JSON.parse(localStorage.getItem('contact_dismissed_chats') || '[]');
      if (dismissed.includes(chatId)) contactDismissed = true;
    } catch {
      /* ignore */
    }
  });

  // Initialize messages + load chats when userId/chatId set
  // Separate from queryText so replaceState doesn't trigger re-run
  $effect(() => {
    if (!browser || !userId || !chatId) return;
    loadChats();
  });

  // Sync messages from server data or fallback to client fetch
  // Tracks chatId to clear stale messages on chat transitions
  let previousChatId = $state('');
  $effect(() => {
    if (!browser || !chatId) return;
    if (chatId !== previousChatId) {
      const isFirstRun = previousChatId === '';
      previousChatId = chatId;
      // Clear stale messages on chat transitions (not on SSR hydration)
      if (!isFirstRun) messages = [];
      loadMessages();
      return; // prevent re-populating from potentially stale data
    }
    // Same-chat path: data is for current chat, use it
    if (data?.messages?.length && !queryText) {
      messages = data.messages as ChatMessage[];
    } else if (!queryText) {
      loadMessages();
    }
  });

  // Auto-send from page state (pending message from home page)
  let autoSent = $state(false);
  $effect(() => {
    if (!browser || !userId || !chatId || isLoading || autoSent) return;
    const pending = (page.state as { q?: string })?.q;
    if (!pending) return;
    autoSent = true;
    sendMessage(pending);
  });

  // Global keyboard shortcuts
  $effect(() => {
    function onKeydown(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        focusInput();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  // Auto-scroll: scroll sentinel into view when messages change and stickToBottom
  $effect(() => {
    if (!stickToBottom || !bottomSentinelEl) return;
    void messages;
    bottomSentinelEl.scrollIntoView({ block: 'end' });
  });

  // Tick `now` for live tool call duration
  $effect(() => {
    if (activeToolCount > 0) {
      const id = setInterval(() => { now = Date.now(); }, 250);
      return () => clearInterval(id);
    }
  });

  // IntersectionObserver: detect if user scrolled away from bottom
  $effect(() => {
    if (!browser || !bottomSentinelEl || !messageListEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        stickToBottom = entry.isIntersecting;
      },
      { root: messageListEl, threshold: 0 },
    );
    observer.observe(bottomSentinelEl);
    return () => observer.disconnect();
  });

  // Scroll to message from URL hash on load and hash changes
  $effect(() => {
    if (!browser || !chatId) return;

    const scrollToHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#msg-')) return;
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: 'center' });
      }
    };

    // Scroll on mount
    scrollToHash();

    // Scroll on hash changes
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  });

  // Fetch tool calls for assistant messages loaded from DB (SSR or API refresh)
  $effect(() => {
    if (!browser || !chatId) return;
    for (const msg of messages) {
      // Skip the currently streaming message — done handler fetches it
      if (msg === messages[messages.length - 1] && msg.role === 'assistant' && isLoading) continue;
      if (msg.role === 'assistant' && msg.id && !toolCallsMap[msg.id]) {
        fetchToolCalls(msg.id);
      }
    }
  });

  // Connect to SSE event source for real-time generation updates
  $effect(() => {
    if (!browser || !chatId) return;

    const es = new EventSource(`/api/ask/${chatId}`);

    let sseTimeout: ReturnType<typeof setTimeout>;
    const resetSseTimeout = () => {
      clearTimeout(sseTimeout);
      sseTimeout = setTimeout(() => {
        es.close();
        console.log('message sse', messages)
        if (isLoading) {
          const last = messages[messages.length - 1];
          if (last?.role !== 'assistant') {
            messages = [
              ...messages,
              {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                text: '',
                timestamp: Date.now(),
                createdAt: '',
                error: 'Request timed out. The AI model may be temporarily unavailable. Please try again.',
              },
            ];
          } else {
            const idx = messages.length - 1;
            messages[idx] = { ...messages[idx], error: 'Request timed out. Please try again.' };
          }
          isLoading = false;
        }
      }, 45000);
    };
    resetSseTimeout();

    // Token streaming — append to last assistant message
    es.addEventListener('token', (e: MessageEvent) => {
      resetSseTimeout();
      if (typeof e.data !== 'string') return;
      const data = JSON.parse(e.data);
      const last = messages[messages.length - 1];
      // Ensure assistant message exists
      if (last?.role !== 'assistant') {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            text: '',
            timestamp: Date.now(),
            createdAt: '',
          },
        ];
      }
      const idx = messages.length - 1;
      messages[idx] = { ...messages[idx], text: messages[idx].text + data.token };
    });

    // Generation complete — finalize assistant message
    es.addEventListener('done', (e: MessageEvent) => {
      clearTimeout(sseTimeout);
      if (typeof e.data !== 'string') return;
      const data = JSON.parse(e.data);

      // Skip replayed done events (already loaded from DB on page refresh)
      const messageId = data.messageId;
      if (typeof messageId !== 'string') return;
      if (messages.some((m) => m.id === messageId)) return;

      const last = messages[messages.length - 1];
      if (last?.role !== 'assistant') {
        // Reconnect case: generation completed between page load and EventSource
        messages = [
          ...messages,
          {
            id: (data.messageId as string) || crypto.randomUUID(),
            role: 'assistant' as const,
            text: data.answer || '',
            timestamp: Date.now(),
            createdAt: '',
            sources: data.sources || [],
          },
        ];
      } else {
        const idx = messages.length - 1;
        const oldPlaceholderId = messages[idx].id;
        messages[idx] = {
          ...messages[idx],
          id: (data.messageId as string) || messages[idx].id,
          text: data.answer || messages[idx].text,
          sources: data.sources || messages[idx].sources,
          modelId: data.usage?.modelId || 0,
          tokensIn: data.usage?.tokensIn || 0,
          tokensOut: data.usage?.tokensOut || 0,
          durationMs: data.usage?.durationMs || 0,
        };
        // Update URL hash if it still points to old placeholder ID from streaming
        if (data.messageId && window.location.hash === `#msg-${oldPlaceholderId}`) {
          history.replaceState(null, '', `#msg-${data.messageId}`);
        }
      }
      if (isLoading) {
        isLoading = false;
        toast.success('Response complete');
        if (document.hidden) playPluckSound();
      }
      // Lazy-load tool calls for this message
      if (data.messageId) {
        fetchToolCalls(data.messageId as string);
        // Reset streaming state for next message
        streamingToolCalls = {};
        currentStatus = '';
      }
    });

    // Contact intent detected — show inline form
    es.addEventListener('contact_intent', () => {
      if (!contactDismissed) {
        showContactForm = true;
      }
    });

    // Tool call started — track for streaming display
    es.addEventListener('tool_call_start', (e: MessageEvent) => {
      resetSseTimeout();
      if (typeof e.data !== 'string') return;
      const data = JSON.parse(e.data);
      streamingToolCalls = {
        ...streamingToolCalls,
        [data.id]: { id: data.id, name: data.name, serverId: data.serverId, startedAt: data.startedAt ?? Date.now() },
      };
    });

    // Tool call finished — mark completed with timestamp
    es.addEventListener('tool_call_end', (e: MessageEvent) => {
      resetSseTimeout();
      if (typeof e.data !== 'string') return;
      const data = JSON.parse(e.data);
      const existing = streamingToolCalls[data.id];
      if (existing) {
        streamingToolCalls = { ...streamingToolCalls, [data.id]: { ...existing, finishedAt: Date.now() } };
      }
    });

    // Status step changed
    es.addEventListener('status', (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      const data = JSON.parse(e.data);
      currentStatus = data.step || '';
    });

    // Error during generation
    es.addEventListener('error', (e: MessageEvent) => {
      clearTimeout(sseTimeout);
      if (typeof e.data !== 'string') return;
      const data = JSON.parse(e.data);
      // Skip replayed error events (message already persisted in DB)
      const msgId = data.messageId;
      if (typeof msgId === 'string' && messages.some((m) => m.id === msgId)) return;
      const last = messages[messages.length - 1];
      if (last?.role !== 'assistant') {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            text: '',
            timestamp: Date.now(),
            createdAt: '',
            error: data.message || 'An error occurred',
            irrecoverable: data.irrecoverable === true,
          },
        ];
      } else {
        const idx = messages.length - 1;
        messages[idx] = { ...messages[idx], error: data.message || 'An error occurred', irrecoverable: data.irrecoverable === true };
      }
      isLoading = false;

      // Lock chat immediately when irrecoverable error (relevance gate rejection)
      if (data.irrecoverable === true && currentChatId) {
        chats = chats.map((c) => (c.id === currentChatId ? { ...c, locked: true } : c));
      }
    });

    // Transport error — EventSource auto-reconnects
    es.onerror = () => {
      console.error('EventSource connection error, will auto-reconnect');
    };

    // Cleanup on component destroy or chatId change
    return () => {
      clearTimeout(sseTimeout);
      es.close();
    };
  });

  // Listen for nav menu requesting sidebar open
  $effect(() => {
    if (!browser) return;
    function handler() { showMobileSidebar.set(true); }
    window.addEventListener('open-chat-sidebar', handler);
    return () => window.removeEventListener('open-chat-sidebar', handler);
  });
</script>

<svelte:head>
  <title>{currentChatTitle || 'Chat'} — woss</title>
</svelte:head>

<div class="flex h-[calc(100dvh-var(--nav-height))] max-md:px-4">
  <ChatSidebar
    {chats}
    {currentChatId}
    {canCreateChat}
    {showDeleteConfirm}
    bind:showMobile={showMobile}
    oncreateChat={createChat}
    onconfirmDeleteChat={confirmDeleteChat}
    ondeleteChat={deleteChat}
    oncancelDelete={() => (showDeleteConfirm = null)}
  />

  <!-- ─── Main Chat Area ─── -->
  <div class="flex-1 flex flex-col min-w-0 relative">
    <!-- Mobile hamburger + title bar -->
    <div
      class="flex items-center justify-between px-4 py-2 md:hidden border-b border-[rgba(255,255,255,0.08)] shrink-0"
    >
      <div class="w-7"></div>
      <span class="text-sm font-heading text-on-surface truncate max-w-50">{currentChatTitle}</span>
      <div class="w-7"></div>
    </div>

    <div class="flex-1 overflow-y-auto p-8 min-h-0 relative" bind:this={messageListEl}>
      {#if !hasMessages && !isLoading}
        <!-- Empty state with suggested questions -->
        <div class="flex flex-col items-center justify-center gap-8 px-8 max-md:px-4 h-full">
          <p class="text-on-surface-variant text-lg max-md:text-base">No messages yet</p>
          <p class="text-on-surface-variant text-sm">Type a message below or pick a question.</p>
          <SuggestedQuestions disabled={isLoading} onquestionclick={(q) => sendMessage(q)} />
        </div>
      {:else}
        <!-- Message list -->
        <div class="flex flex-col gap-3 py-4 max-w-[80vw] mx-auto w-full max-md:px-4 max-sm:px-3">
          {#each messages as message, i (message.id)}
            <MsgCard
              {message}
              isLoading={i === messages.length - 1 && isLoading}
              isLast={i === messages.length - 1}
              {streamingToolValues}
              {now}
              {toolCallsMap}
              {userId}
              onretry={retry}
              onreport={handleReport}
            />
          {/each}
        </div>
      {/if}

      {#if hasMessages}
        <div bind:this={bottomSentinelEl} aria-hidden="true" class="h-px"></div>
      {/if}

    </div>

    <ContactForm bind:showContactForm {userId} {chatId} bind:contactDismissed />

    <!-- Scroll to bottom -->
    {#if !stickToBottom && hasMessages}
      <div class="flex justify-center py-1">
        <button
          onclick={() => (stickToBottom = true)}
          class="flex items-center justify-center w-7 h-7 rounded-full bg-surface-container-high border border-primary/30 text-primary cursor-pointer transition-all duration-200 hover:bg-surface-container hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] active:scale-95"
          aria-label="Scroll to bottom"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>
      </div>
    {/if}

    <!-- Max messages reached or Input bar -->
    {#if maxMessagesReached && !isLoading}
      <div class="text-center py-4 px-4 border-t border-[rgba(255,255,255,0.08)]">
        <p class="text-sm text-on-surface-variant">
          This chat has reached the maximum of {config.public.maxMessages} messages. <button
            class="text-primary underline bg-transparent border-0 cursor-pointer"
            onclick={createChat}>Start a new chat</button
          >
        </p>
      </div>
    {:else}
      <ChatInput
        bind:messageText
        {isLoading}
        {canSend}
        {hasMessages}
        {currentChat}
        {maxMessagesReached}
        messagesCount={userMessageCount}
        maxMessages={config.public.maxMessages}
        {activeToolCount}
        {completedToolCount}
        {currentStatus}
        bind:inputEl
        onsend={(text: string) => sendMessage(text)}
        oncreateChat={createChat}
      />
    {/if}
    <div class="px-8 pb-4 max-w-[80vw] mx-auto w-full max-md:px-4 max-sm:px-3 flex flex-col items-center gap-2">
      <SoundToggle />
      <p class="text-xs text-on-surface-variant text-center">AI can make mistakes. Verify important information.</p>
    </div>
  </div>
</div>
