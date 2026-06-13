<script lang="ts">
  import { SUGGESTED_QUESTIONS } from '$lib/chat/suggested-questions';

  let { questions = SUGGESTED_QUESTIONS, disabled = false, onquestionclick }: {
    questions?: string[];
    disabled?: boolean;
    onquestionclick: (question: string) => void;
  } = $props();
</script>

<div class="flex flex-wrap justify-center gap-3 max-md:flex-col max-md:items-center">
  {#each questions as question (question)}
    <button
      class="font-body text-sm text-on-surface bg-[color-mix(in_srgb,var(--color-secondary-dim)_15%,transparent)] border border-[rgba(255,255,255,0.06)] rounded-full px-4 py-2 cursor-pointer transition-all duration-150 hover:border-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] disabled:opacity-40 disabled:cursor-not-allowed max-md:w-full max-md:text-left max-md:px-4 max-md:py-2.5"
      onclick={() => onquestionclick(question)}
      disabled={disabled}
    >
      {question}
    </button>
  {/each}
</div>
