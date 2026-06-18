<script lang="ts">
  let {
    tools = [] as Array<{
      id: string;
      name: string;
      serverId: string;
      startedAt: number;
      finishedAt?: number;
    }>,
    now = Date.now(),
  }: {
    tools: Array<{ id: string; name: string; serverId: string; startedAt: number; finishedAt?: number }>;
    now?: number;
  } = $props();

  // Cache the last non-empty tool list so we can fade it out
  let cachedTools = $state<typeof tools>([]);
  let fading = $state(false);

  // Capture tools when they arrive
  $effect(() => {
    if (tools.length > 0) {
      cachedTools = tools;
      fading = false;
    }
  });

  // When tools empty but we have cached entries, start fade-out
  $effect(() => {
    if (tools.length === 0 && cachedTools.length > 0 && !fading) {
      fading = true;
      const timer = setTimeout(() => {
        cachedTools = [];
        fading = false;
      }, 1500);
      return () => clearTimeout(timer);
    }
  });

  const displayTools = $derived(fading ? cachedTools : tools);

  function formatDuration(ms: number): string {
    if (ms <= 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function toolIcon(name: string): string {
    if (name.includes('search') || name.includes('fetch')) return '🔍';
    if (name.includes('read') || name.includes('list')) return '📄';
    if (name.includes('write') || name.includes('create')) return '✏️';
    return '⚙';
  }
</script>

{#if displayTools.length > 0}
  <div
    class="mt-4 space-y-1 overflow-hidden transition-all duration-700"
    class:animate-tool-fade-out={fading}
    class:pointer-events-none={fading}
  >
    {#each displayTools as tool (tool.id)}
      <div
        class="flex items-center gap-2.5 px-3 py-2 rounded-lg border {tool.finishedAt
          ? 'bg-surface-container/20 border-outline-variant/10'
          : 'bg-surface-container/40 border-primary/10'} {fading ? 'opacity-60' : ''}"
      >
        <span
          class="shrink-0 size-2 rounded-full {tool.finishedAt
            ? 'bg-success'
            : 'bg-warning animate-pulse-dot'}"
          aria-hidden="true"
        ></span>
        <span class="shrink-0 text-xs">{toolIcon(tool.name)}</span>
        <span class="truncate text-xs font-mono text-on-surface-variant"
          >{tool.serverId}/{tool.name}</span
        >
        <span class="tabular-nums text-xs font-mono text-outline/60 ml-auto shrink-0"
          >{formatDuration(
            Math.abs((tool.finishedAt ?? now) - tool.startedAt),
          )}</span
        >
        <span
          class="text-[10px] font-mono {tool.finishedAt
            ? 'text-success/60'
            : 'text-warning'} shrink-0"
          >{tool.finishedAt ? 'done' : '…'}</span
        >
      </div>
    {/each}
  </div>
{/if}
