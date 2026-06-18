<script lang="ts">
  import { Select, Button } from 'sv5ui';
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
    {#each SUGGESTED_QUESTIONS as q (q)}
      <Button
        variant="outline" size="sm"
        onclick={() => onquestionclick(q)}
        {disabled}
        class="rounded-xl active:scale-95 max-md:text-xs"
      >
        {q}
      </Button>
    {/each}
  </div>
{:else}
  <Select placeholder="Pick a question…" {items} bind:value={selectedValue} variant="subtle" size="sm" {disabled} />
{/if}
