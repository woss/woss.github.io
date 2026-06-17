<script lang="ts">
 import type { Chat } from '$lib/chat/types';
 import { useSlashMenu } from '$lib/chat/use-slash-menu.svelte';
 import SlashMenu from './SlashMenu.svelte';
 import { config } from '$lib/config';
 import { enhance } from '$app/forms';

 const MAX_CHARS = 500;

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
 userId = '',
 currentChat = null as Chat | null,
 messagesCount = 0,
 maxMessages = config.public.maxMessages,
 activeToolCount = 0,
 completedToolCount = 0,
 currentStatus = '',
 inputEl = $bindable<HTMLDivElement | undefined>(undefined),
 onsend = () => {},
 oncreateChat = () => {},
 onstop = () => {},
 } = $props();

 let formEl = $state<HTMLFormElement | undefined>(undefined);
 let charCount = $derived(messageText.length);
 let isOverLimit = $derived(charCount > MAX_CHARS);
 let hasText = $derived(messageText.trim().length > 0);

 const slash = useSlashMenu(() => messageText, (cmd) => onsend(cmd));

 function handleSubmit({ formData, cancel }: {
 formData: FormData;
 action: URL;
 cancel: () => void;
 submitter: HTMLElement | null;
 }) {
 cancel();
 onsend(messageText);
 }

 function handleInput(e: Event): void {
 const el = e.currentTarget as HTMLDivElement;
 messageText = el.innerText;

 // Clean up empty state for :empty placeholder selector
 if (messageText.trim() === '') {
 el.innerHTML = '';
 messageText = '';
 }

 slash.handleInput();
 }

 $effect(() => {
 if (inputEl && inputEl.innerText !== messageText) {
 // eslint-disable-next-line svelte/no-dom-manipulating -- intentional: contenteditable DOM sync with external messageText changes. Svelte 5 $effect is the recommended pattern for contenteditable sync per Svelte docs.
 inputEl.innerText = messageText;
 }
 });

 function handleKeydown(e: KeyboardEvent): void {
 if (slash.handleKeydown(e)) return;

 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 formEl?.requestSubmit();
 }
 if (e.key === 'Escape') {
 messageText = '';
 }
 }

 function handleSend(): void {
 if (!hasText || isOverLimit || isLoading) return;
 formEl?.requestSubmit();
 }

 function handleStop(): void {
 onstop();
 }
</script>

 {#if isLoading}
 <div class="py-1.5">
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
 class="size-1 rounded-full bg-on-surface-variant animate-pulse-dot"
 style="animation-delay:0ms"
 ></span>
 <span
 class="size-1 rounded-full bg-on-surface-variant animate-pulse-dot"
 style="animation-delay:200ms"
 ></span>
 <span
 class="size-1 rounded-full bg-on-surface-variant animate-pulse-dot"
 style="animation-delay:400ms"
 ></span>
 </span>
 {/if}
 </div>
 </div>
 {/if}

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
 <form method="POST" action="?/ask" use:enhance={handleSubmit} bind:this={formEl}>
  <div
 class="relative rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface-container-high transition-all duration-200"
 >
 <SlashMenu
 show={slash.showSlashMenu}
 commands={slash.slashFiltered}
 selectedIndex={slash.slashSelectedIndex}
 onselect={slash.selectSlashCommand}
 onmouseenter={(i: number) => slash.slashSelectedIndex = i}
 />
 <!-- Input row -->
 <div class="flex items-center gap-2 px-3 pt-3">
 <!-- contenteditable input -->
 <div
 contenteditable="true"
 role="textbox"
 aria-multiline="true"
 tabindex="0"
 class="flex-1 font-body text-base/normal text-on-surface bg-transparent py-3 outline-none min-h-[44px] max-h-[120px] overflow-y-auto [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-on-surface-variant [&:empty:before]:pointer-events-none"
 data-placeholder="Ask Haistlin about Daniel."
 bind:this={inputEl}
 oninput={handleInput}
 onkeydown={handleKeydown}
 ></div>
 <!-- Submit / Stop button -->
 <button
 type="button"
 class="flex items-center justify-center size-8 border-0 rounded-lg transition-all duration-150 shrink-0"
 class:bg-primary={!isLoading && hasText}
 class:bg-surface-container={isOverLimit || (!hasText && !isLoading)}
 class:text-surface={!isLoading && hasText}
 class:text-on-surface-variant={isOverLimit || (!hasText && !isLoading)}
 class:bg-secondary={isLoading}
 class:cursor-pointer={hasText || isLoading}
 class:cursor-not-allowed={!hasText && !isLoading}
 disabled={(!hasText || isOverLimit) && !isLoading}
 onclick={isLoading ? handleStop : handleSend}
 aria-label={isLoading ? 'Stop' : 'Send message'}
 >
 {#if isLoading}
 <!-- Stop square -->
 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
 {:else}
 <!-- Arrow up -->
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
 <line x1="12" y1="19" x2="12" y2="5" />
 <polyline points="5 12 12 5 19 12" />
 </svg>
 {/if}
 </button>
 </div>
 <!-- Bottom toolbar -->
 <div class="flex items-center justify-between px-3 pb-3 max-md:justify-end">
  <div>
  <span class="font-mono text-xs text-on-surface-variant max-md:hidden"
  >{messagesCount}/{maxMessages} messages</span
  >
  </div>
 <div class="flex-1 text-center px-2 max-md:hidden">
 <p class="text-xs text-on-surface-variant">AI can make mistakes. Verify important information.</p>
 </div>
  <span
  class="font-mono text-xs text-on-surface-variant"
  class:text-secondary={isOverLimit}
  >{charCount}/{MAX_CHARS}</span>
 </div>
 </div>
 </form>
 {/if}
