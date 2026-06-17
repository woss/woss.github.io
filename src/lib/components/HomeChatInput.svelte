<script lang="ts">
 import SlashMenu from './SlashMenu.svelte';
 import SuggestedQuestions from './SuggestedQuestions.svelte';
 import { useSlashMenu } from '$lib/chat/use-slash-menu.svelte';

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

 const slash = useSlashMenu(() => messageText, (cmd) => onsend(cmd));

 function handleInput(e: Event): void {
 const el = e.currentTarget as HTMLTextAreaElement;
 el.style.height = 'auto';
 el.style.height = Math.min(el.scrollHeight, 120) + 'px';

 slash.handleInput();
 }

 function handleKeydown(e: KeyboardEvent): void {
 if (slash.handleKeydown(e)) return;

 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 onsend(messageText);
 }
 if (e.key === 'Escape') {
 messageText = '';
 }
 }
</script>

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
 <!-- Textarea row -->
 <div class="flex items-center gap-2 px-3 pt-3 max-md:flex-col max-md:items-stretch max-md:pt-3 max-md:px-2">
 <div class="relative flex-1 min-w-0">
 {#if messageText.startsWith('/')}
 <span
 class="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-primary pointer-events-none z-10"
 >/</span
 >
 {/if}
 <textarea
 class="w-full font-body text-base/normal text-on-surface bg-transparent py-3 min-h-11 max-h-30 max-md:max-h-20 resize-none outline-none transition-colors duration-150 placeholder:text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed"
 class:pl-8={messageText.startsWith('/')}
 class:pl-4={!messageText.startsWith('/')}
 bind:value={messageText}
 bind:this={inputEl}
 placeholder="Ask Haistlin about Daniel."
 rows="1"
 maxlength={MAX_CHARS}
 disabled={isLoading}
 oninput={handleInput}
 onkeydown={handleKeydown}
 ></textarea>
 </div>
 <button
 class="flex items-center justify-center size-8 border-0 rounded-lg bg-primary text-surface cursor-pointer transition-all duration-150 shrink-0 hover:shadow-[0_0_20px_rgba(0,218,140,0.15)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
 class:bg-[color-mix(in_srgb,var(--color-primary)_50%,transparent)]={isLoading}
 class:cursor-wait={isLoading}
 disabled={!canSend}
 aria-label="Send message"
 onclick={() => onsend(messageText)}
 >
 {#if isLoading}
 <span class="size-2 rounded-full bg-surface animate-pulse-send" aria-hidden="true"></span>
 {:else}
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
 <line x1="12" y1="19" x2="12" y2="5" />
 <polyline points="5 12 12 5 19 12" />
 </svg>
 {/if}
 </button>
 </div>
 <!-- Bottom toolbar -->
 <div class="flex items-center justify-between px-3 pb-3 max-md:px-2">
 <div></div>
 <div class="flex-1 text-center px-2 max-md:hidden">
 <p class="text-xs text-on-surface-variant">AI can make mistakes. Verify important information.</p>
 </div>
  <span
  class="font-mono text-xs text-on-surface-variant"
  class:text-secondary={isOverLimit}
  >{charCount}/{MAX_CHARS}</span>
 </div>
</div>

<SuggestedQuestions disabled={isLoading} onquestionclick={onsuggested} />
