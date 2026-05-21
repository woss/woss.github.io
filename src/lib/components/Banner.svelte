<script lang="ts">
 let {
 type = 'info',
 message = '',
 persistent = false,
 onclose = () => {},
 }: {
 type?: 'info' | 'warning' | 'pro';
 message?: string;
 persistent?: boolean;
 onclose?: () => void;
 } = $props();

 const colorMap: Record<string, string> = {
 info: 'bg-primary/10 text-primary border border-primary/20',
 warning: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
 pro: 'bg-[#00da8c]/10 text-[#00da8c] border border-[#00da8c]/20',
 };
</script>

<div class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm {colorMap[type]}">
 <!-- Icon -->
 {#if type === 'info'}
 <svg
 width="16"
 height="16"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 stroke-width="2"
 stroke-linecap="round"
 stroke-linejoin="round"
 class="shrink-0"
 >
 <circle cx="12" cy="12" r="10" />
 <line x1="12" y1="16" x2="12" y2="12" />
 <line x1="12" y1="8" x2="12.01" y2="8" />
 </svg>
 {:else if type === 'warning'}
 <svg
 width="16"
 height="16"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 stroke-width="2"
 stroke-linecap="round"
 stroke-linejoin="round"
 class="shrink-0"
 >
 <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
 <line x1="12" y1="9" x2="12" y2="13" />
 <line x1="12" y1="17" x2="12.01" y2="17" />
 </svg>
 {:else if type === 'pro'}
 <svg
 width="16"
 height="16"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 stroke-width="2"
 stroke-linecap="round"
 stroke-linejoin="round"
 class="shrink-0"
 >
 <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
 <line x1="18" y1="3" x2="18" y2="7" />
 <line x1="21" y1="5" x2="17" y2="5" />
 <line x1="7" y1="17" x2="7" y2="21" />
 <line x1="4" y1="19" x2="8" y2="19" />
 </svg>
 {/if}

 <!-- Message -->
 <span class="flex-1">{message}</span>

 <!-- Pro CTA -->
 {#if type === 'pro'}
 <button
 class="ml-2 px-3 py-1 rounded-md bg-[#00da8c] text-black text-xs font-semibold hover:bg-[#00da8c]/90 transition-colors shrink-0"
 >
 Upgrade
 </button>
 {/if}

 <!-- Spacer when no close button -->
 {#if persistent}
 <span class="w-6"></span>
 {:else}
 <button
 class="size-6 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-black/20 transition-all shrink-0"
 onclick={onclose}
 aria-label="Dismiss banner"
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
</div>
