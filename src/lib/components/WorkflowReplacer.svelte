<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { copyToClipboard } from '$lib/utils/clipboard';

  type PlaceholderDef = {
    key: string;
    label: string;
    hint?: string;
  };

  type WorkflowFileDef = {
    label: string;
    json: string;
    placeholders: PlaceholderDef[];
  };

  let {
    workflowFiles,
  }: {
    workflowFiles: WorkflowFileDef[];
  } = $props();

  let expanded = $state<Set<number>>(new Set());

  function toggle(index: number) {
    const next = new Set(expanded);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    expanded = next;
  }

  function copy(index: number) {
    const wf = workflowFiles[index];
    let result = wf.json;
    const inputs = document.querySelectorAll<HTMLInputElement>(
      `[data-replacer-input="${index}"]`,
    );
    const unfilled: string[] = [];
    inputs.forEach((input) => {
      const key = input.dataset.key || '';
      const val = input.value.trim();
      if (!val) {
        unfilled.push(key);
        return;
      }
      const re = new RegExp(escapeRegex(key), 'g');
      result = result.replace(re, val);
    });

    if (unfilled.length > 0) {
      toast.warning(`Unfilled: ${unfilled.join(', ')} — copying anyway`);
    }

    if (copyToClipboard(result)) {
      toast.success('Workflow JSON copied to clipboard');
    }
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function formatJson(str: string): string {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }
</script>

<div class="workflow-replacer space-y-6">
  {#each workflowFiles as wf, i (i)}
    <div class="wf-card bg-surface-container border border-[rgba(255,255,255,0.08)] rounded-lg overflow-hidden">
      <h3 class="text-sm font-mono font-semibold text-secondary uppercase tracking-[0.08em] px-4 pt-4 pb-0 m-0">
        {wf.label}
      </h3>

      <!-- JSON preview (collapsible) -->
      <details class="group px-4 py-2">
        <summary
          class="flex items-center gap-2 cursor-pointer list-none text-xs font-mono text-on-surface-variant select-none"
        >
          <svg
            class="size-3.5 transition-transform duration-200 group-open:rotate-90"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"><path d="M6 4l4 4-4 4" /></svg
          >
          Preview JSON
        </summary>
        <pre
          class="mt-2 p-3 rounded-md bg-[rgba(0,0,0,0.3)] text-xs leading-relaxed overflow-x-auto max-h-64 overflow-y-auto font-mono text-slate-300"
><code>{formatJson(wf.json)}</code></pre>
      </details>

      <!-- Placeholder inputs -->
      <div class="px-4 pb-3 space-y-3">
        {#each wf.placeholders as ph}
          <div class="flex flex-col gap-1">
            <label
              for="replacer-{i}-{ph.key}"
              class="text-xs font-mono text-on-surface-variant"
            >
              {ph.label}
              {#if ph.hint}
                <span class="text-[10px] text-on-surface-variant/60">— {ph.hint}</span>
              {/if}
            </label>
            <input
              id="replacer-{i}-{ph.key}"
              data-replacer-input={i}
              data-key={ph.key}
              type="text"
              value={ph.key}
              class="w-full px-3 py-2 text-xs font-mono bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-md text-white placeholder-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors duration-150"
            />
          </div>
        {/each}
      </div>

      <!-- Copy button -->
      <div class="px-4 pb-4">
        <button
          onclick={() => copy(i)}
          class="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-[0.06em] bg-primary text-surface rounded-md transition-all duration-150 hover:brightness-110 active:scale-[0.97] cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy to Clipboard
        </button>
      </div>
    </div>
  {/each}
</div>
