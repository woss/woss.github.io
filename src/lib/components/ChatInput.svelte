<script lang="ts">
  import type { Chat } from '$lib/chat/types';
  import { config } from '$lib/config';

  const MAX_CHARS = 500;
  const SLASH_COMMANDS = [
    {
      command: '/contact',
      description: 'Show contact form',
      keywords: 'contact hire collaborate work',
    },
    {
      command: '/summarize',
      description: 'Summarize current conversation',
      keywords: 'summary recap tl dr digest',
    },
  ] as const;

  const STATUS_LABELS: Record<string, string> = {
    checking_relevance: 'Checking relevance',
    embedding: 'Embedding',
    checking_cache: 'Checking cache',
    searching: 'Searching',
    generating: 'Generating',
  };

  let {
    messageText = $bindable(''),
    isLoading = false,
    canSend = false,
    hasMessages = false,
    currentChat = null as Chat | null,
    maxMessagesReached = false,
    messagesCount = 0,
    maxMessages = config.public.maxMessages,
    activeToolCount = 0,
    completedToolCount = 0,
    currentStatus = '',
    inputEl = $bindable<HTMLTextAreaElement | undefined>(undefined),
    onsend = () => {},
    oncreateChat = () => {},
  } = $props();

  let showSlashMenu = $state(false);
  let slashSelectedIndex = $state(0);

  let charCount = $derived(messageText.length);
  let isOverLimit = $derived(charCount > MAX_CHARS);
  let slashFiltered = $derived(
    messageText.startsWith('/')
      ? SLASH_COMMANDS.filter((c) =>
          c.command.includes(messageText.toLowerCase()),
        )
      : [],
  );

  function handleInput(e: Event): void {
    const el = e.currentTarget as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';

    if (messageText.startsWith('/')) {
      showSlashMenu = true;
      slashSelectedIndex = 0;
    } else {
      showSlashMenu = false;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashSelectedIndex =
          (slashSelectedIndex + 1) % slashFiltered.length;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashSelectedIndex =
          (slashSelectedIndex - 1 + slashFiltered.length) %
          slashFiltered.length;
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (slashFiltered.length > 0) {
          selectSlashCommand(slashFiltered[slashSelectedIndex].command);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        showSlashMenu = false;
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onsend(messageText);
    }
    if (e.key === 'Escape') {
      messageText = '';
    }
  }

  function selectSlashCommand(cmd: string): void {
    showSlashMenu = false;
    onsend(cmd);
  }
</script>

<!-- Max messages reached or Input bar -->
{#if maxMessagesReached && !isLoading}
  <div class="text-center py-4 px-4 border-t border-[rgba(255,255,255,0.08)]">
    <p class="text-sm text-on-surface-variant">
      This chat has reached the maximum of {maxMessages} messages.
      <button
        class="text-primary underline bg-transparent border-0 cursor-pointer"
        onclick={() => oncreateChat()}>Start a new chat</button
      >
    </p>
  </div>
{:else}
  <div
    class="sticky bottom-0 shrink-0 w-full bg-surface border-t border-[rgba(255,255,255,0.08)] px-8 max-md:px-4"
  >
    {#if isLoading}
      <div class="py-1.5 max-w-[80vw] mx-auto">
        <div class="flex items-center gap-2 text-xs font-mono min-h-[16px]">
          {#if activeToolCount > 0}
            <span class="text-yellow-400/90"
              >Running {activeToolCount} tool{activeToolCount !== 1
                ? 's'
                : ''}</span
            >
            {#if completedToolCount > 0}
              <span class="text-outline"
                >· {completedToolCount} completed</span
              >
            {/if}
          {:else}
            <span class="text-on-surface-variant"
              >{STATUS_LABELS[currentStatus] || 'Thinking'}</span
            >
            <span class="inline-flex gap-0.5">
              <span
                class="w-1 h-1 rounded-full bg-on-surface-variant animate-pulse-dot"
                style="animation-delay:0ms"
              ></span>
              <span
                class="w-1 h-1 rounded-full bg-on-surface-variant animate-pulse-dot"
                style="animation-delay:200ms"
              ></span>
              <span
                class="w-1 h-1 rounded-full bg-on-surface-variant animate-pulse-dot"
                style="animation-delay:400ms"
              ></span>
            </span>
          {/if}
        </div>
      </div>
    {/if}
    <div class="py-4 max-md:py-3">
      <div class="relative max-w-[80vw] mx-auto">
        <!-- Slash drop-up menu -->
        {#if showSlashMenu && slashFiltered.length > 0}
          <div
            class="absolute bottom-full left-0 right-0 mb-2 bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden shadow-[0_-4px_24px_rgba(0,0,0,0.3)] z-50"
          >
            <div
              class="px-3 py-2 border-b border-[rgba(255,255,255,0.06)]"
            >
              <span
                class="font-heading text-[11px] uppercase tracking-widest text-outline"
                >Commands</span
              >
            </div>
            {#each slashFiltered as cmd, i (cmd.command)}
              <button
                class="flex items-center gap-3 w-full px-4 py-2.5 text-left bg-transparent border-0 cursor-pointer transition-all duration-100"
                class:bg-[rgba(0,255,136,0.15)]={i === slashSelectedIndex}
                style={i === slashSelectedIndex
                  ? 'border-left:2px solid rgba(0,255,136,0.5)'
                  : ''}
                onmouseenter={() => {
                  slashSelectedIndex = i;
                }}
                onclick={() => selectSlashCommand(cmd.command)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') selectSlashCommand(cmd.command);
                }}
              >
                <span
                  class="font-mono text-sm text-primary font-semibold"
                  >{cmd.command}</span
                >
                <span
                  class="font-body text-xs"
                  class:text-on-surface-variant={i !== slashSelectedIndex}
                  class:text-on-surface={i === slashSelectedIndex}
                  >{cmd.description}</span
                >
              </button>
            {/each}
          </div>
        {/if}
        <!-- Input content -->
        {#if currentChat?.locked}
          <div
            class="flex items-center gap-2 px-4 py-3 bg-[color-mix(in_srgb,var(--color-secondary)_8%,transparent)] border border-secondary/30 rounded-lg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="text-secondary shrink-0"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span class="text-sm text-on-surface-variant"
              >This chat has been locked because the question was
              off-topic.
              <button
                class="text-primary underline bg-transparent border-0 cursor-pointer"
                onclick={() => oncreateChat()}>Start a new chat</button
              ></span
            >
          </div>
        {:else}
          <div
            class="relative rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface-container-high focus-within:border-primary/50 focus-within:shadow-[0_0_0_1px_rgba(0,255,136,0.15),0_0_20px_rgba(0,255,136,0.05)] transition-all duration-200"
          >
            <!-- Clear button -->
            {#if hasMessages && !isLoading}
              <button
                class="absolute top-2 right-2 z-10 flex items-center justify-center w-6 h-6 border-0 rounded-md bg-transparent text-outline cursor-pointer transition-colors duration-150 hover:text-on-surface-variant hover:bg-[rgba(255,255,255,0.06)]"
                onclick={() => oncreateChat()}
                aria-label="Clear chat"
                title="Start new chat"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            {/if}
            <!-- Textarea with / indicator -->
            <div class="relative">
              {#if messageText.startsWith('/')}
                <span
                  class="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-primary pointer-events-none z-10"
                  >/</span
                >
              {/if}
              <textarea
                class="w-full font-body text-base text-on-surface bg-transparent py-3 min-h-[44px] max-h-[120px] resize-none outline-none transition-colors duration-150 leading-normal placeholder:text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed"
                class:pl-8={messageText.startsWith('/')}
                class:pl-4={!messageText.startsWith('/')}
                bind:value={messageText}
                bind:this={inputEl}
                placeholder="Curious about Daniel? Ask away."
                rows="1"
                maxlength={MAX_CHARS}
                disabled={isLoading}
                oninput={handleInput}
                onkeydown={handleKeydown}
              ></textarea>
            </div>
            <!-- Bottom toolbar -->
            <div class="flex items-center justify-between px-3 pb-3">
              <div>
                {#if messagesCount > 0}
                  <span class="font-mono text-xs text-on-surface-variant"
                    >{messagesCount}/{maxMessages} messages</span
                  >
                {/if}
              </div>
              <div class="flex items-center gap-3">
                {#if charCount > 0}
                  <span
                    class="font-mono text-xs text-on-surface-variant"
                    class:text-secondary={isOverLimit}
                    >{charCount}/{MAX_CHARS}</span
                  >
                {/if}
                <button
                  class="flex items-center justify-center w-8 h-8 border-0 rounded-lg bg-primary text-surface cursor-pointer transition-all duration-150 shrink-0 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
                  class:bg-[color-mix(in_srgb,var(--color-primary)_50%,transparent)]={isLoading}
                  class:cursor-wait={isLoading}
                  disabled={!canSend}
                  onclick={() => onsend(messageText)}
                  aria-label="Send message"
                >
                {#if isLoading}
                  <span
                    class="w-2 h-2 rounded-full bg-surface animate-pulse-send"
                    aria-hidden="true"
                  ></span>
                {:else}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                {/if}
              </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
