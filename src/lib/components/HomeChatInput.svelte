<script lang="ts">
  import SuggestedQuestions from './SuggestedQuestions.svelte';

  const MAX_CHARS = 500;

  let {
    messageText = $bindable(''),
    isLoading = $bindable(false),
    inputEl = $bindable<HTMLTextAreaElement | undefined>(),
    onsend = () => {},
    onsuggested = () => {},
  }: {
    messageText?: string;
    isLoading?: boolean;
    inputEl?: HTMLTextAreaElement | undefined;
    onsend?: (text: string) => void;
    onsuggested?: (question: string) => void;
  } = $props();

  let charCount = $derived(messageText.length);
  let isOverLimit = $derived(charCount > MAX_CHARS);
  let canSend = $derived(!isLoading && messageText.trim().length > 0 && !isOverLimit);

  function handleInput(e: Event): void {
    const el = e.currentTarget as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onsend(messageText);
    }
    if (e.key === 'Escape') {
      messageText = '';
    }
  }
</script>

<div class="flex items-end gap-3">
  <textarea
    class="flex-1 font-body text-base text-on-surface bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-lg px-4 py-3 min-h-11 max-h-30 resize-none outline-none transition-colors duration-150 leading-normal placeholder:text-on-surface-variant focus:border-primary focus:shadow-[0_0_0_1px_var(--color-primary),0_0_16px_rgba(0,255,136,0.12)] disabled:opacity-50 disabled:cursor-not-allowed"
    class:border-secondary={isOverLimit}
    class:shadow-[0_0_0_1px_var(--color-secondary)]={isOverLimit}
    bind:value={messageText}
    bind:this={inputEl}
    placeholder="Ask anything about my work..."
    rows="1"
    maxlength={MAX_CHARS}
    disabled={isLoading}
    oninput={handleInput}
    onkeydown={handleKeydown}
  ></textarea>

  <div class="flex items-center gap-2 shrink-0 self-end">
    {#if charCount > 0}
      <span
        class="font-mono text-xs text-on-surface-variant whitespace-nowrap"
        class:text-secondary={isOverLimit}
      >
        {charCount}/{MAX_CHARS}
      </span>
    {/if}

    <button
      class="flex items-center justify-center w-11 h-11 border-0 rounded-lg bg-primary text-surface cursor-pointer transition-all duration-150 shrink-0 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
      disabled={!canSend}
      onclick={() => onsend(messageText)}
      aria-label="Send message"
    >
      {#if isLoading}
        <span class="w-2.5 h-2.5 rounded-full bg-surface shadow-[0_0_6px_var(--color-surface)] animate-pulse-send" aria-hidden="true"></span>
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      {/if}
    </button>
  </div>
</div>

<SuggestedQuestions disabled={isLoading} onquestionclick={onsuggested} />
