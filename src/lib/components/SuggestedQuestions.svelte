<script lang="ts">
 import { Select } from 'sv5ui';
 import { SUGGESTED_QUESTIONS } from '$lib/chat/suggested-questions';

 let { disabled = false, onquestionclick }: {
 disabled?: boolean;
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

<Select
 placeholder="Pick a question…"
 items={items}
 bind:value={selectedValue}
 variant="subtle"
 size="sm"
 {disabled}
/>
