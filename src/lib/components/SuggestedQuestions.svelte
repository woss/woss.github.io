<script lang="ts">
  import { Select } from 'sv5ui';
  import { SUGGESTED_QUESTIONS } from '$lib/chat/suggested-questions';

  let {
    disabled = false,
    variant = 'select',
    onquestionclick,
  }: {
    disabled?: boolean;
    variant?: 'select' | 'cards';
    onquestionclick: (question: string) => void;
  } = $props();

  let selectedValue = $state<string | undefined>();

  $effect(() => {
    if (selectedValue) {
      onquestionclick(selectedValue);
      selectedValue = undefined;
    }
  });

  const items = SUGGESTED_QUESTIONS.map((q) => ({
    value: q,
    label: q,
  }));
</script>

{#if variant === 'cards'}
  <div class="flex flex-wrap gap-2 justify-center max-w-lg">
    {#each SUGGESTED_QUESTIONS as q}
      <button
        onclick={() => onquestionclick(q)}
        disabled={disabled}
        class="max-md:text-xs max-md:px-2 max-md:py-1.5 px-3 py-1.5 rounded-xl bg-surface-container-high border border-primary/15 text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface hover:border-primary/30 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {q}
      </button>
    {/each}
  </div>
{:else}
  <Select
    placeholder="Pick a question…"
    items={items}
    bind:value={selectedValue}
    variant="subtle"
    size="sm"
    {disabled}
  />
{/if}
