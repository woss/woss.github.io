<script lang="ts">
  import { copyToClipboard } from '$lib/utils/clipboard';
  import { toast } from 'svelte-sonner';

  let {
    text,
    toastMessage = 'Copied to clipboard',
    label = 'Copy',
    class: className = '',
  }: {
    text: string;
    toastMessage?: string;
    label?: string;
    class?: string;
  } = $props();

  function handle() {
    if (copyToClipboard(text)) {
      toast.success(toastMessage);
    } else {
      toast.error('Failed to copy');
    }
  }

  const defaultClass =
    'flex items-center justify-center size-7 bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-on-surface-variant cursor-pointer transition-colors duration-150 shrink-0 p-0 hover:text-primary hover:border-primary';
</script>

<button onclick={handle} aria-label={label} title={label} class={className || defaultClass}>
  <svg class="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
</button>
