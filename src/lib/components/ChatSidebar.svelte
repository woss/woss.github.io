<script lang="ts">
  import { resolve } from '$app/paths';
  import { slide } from 'svelte/transition';
  import type { Chat } from '$lib/chat/types';
  import { config } from '$lib/config';
  import { SLASH_COMMANDS } from '$lib/chat/slash-commands';

  import SoundToggle from '$lib/components/SoundToggle.svelte';
  let {
    chats,
    currentChatId = null,
    canCreateChat = false,
    showDeleteConfirm = null,
    showMobile = $bindable(false),
    oncreateChat = () => {},
    ondeleteChat = () => {},
    onconfirmDeleteChat = () => {},
    oncancelDelete = () => {},
  }: {
    chats: Chat[];
    currentChatId?: string | null;
    canCreateChat?: boolean;
    showDeleteConfirm?: string | null;
    showMobile?: boolean;
    oncreateChat?: () => void;
    ondeleteChat?: (id: string) => void;
    onconfirmDeleteChat?: (id: string) => void;
    oncancelDelete?: () => void;
  } = $props();

  // ── MCP connection status ──
  let mcpServers: Array<{ id: string; label?: string; connected: boolean; homepage?: string }> = $state([]);

  $effect(() => {
    fetch('/api/mcp/status')
      .then(r => r.json())
      .then(data => { mcpServers = data.servers; })
      .catch(() => { mcpServers = []; });
  });
</script>

<!-- ─── Desktop sidebar ─── -->
<aside class="w-65 max-w-65 shrink-0 border-r border-[rgba(255,255,255,0.08)] bg-surface hidden md:flex flex-col overflow-hidden sticky self-start h-[calc(100vh-var(--nav-height))]">
  <!-- New Chat button -->
  <div class="p-3 border-b border-[rgba(255,255,255,0.08)]">
    <button
      class="w-full flex items-center justify-center gap-2 px-3 py-2.5 font-body text-sm text-on-surface bg-primary/10 border border-primary/25 rounded-lg cursor-pointer transition-all duration-150 hover:bg-primary/20 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
      onclick={oncreateChat}
      disabled={!canCreateChat}
      title={!canCreateChat ? `Maximum ${config.public.maxChats} chats` : 'New chat'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>New Chat</span>
    </button>
  </div>

  <!-- Chat list -->
  <div class="flex-1 overflow-y-auto p-3 space-y-1">
    {#each chats as chat (chat.id)}
      <div class="relative group flex items-center gap-1" transition:slide={{ duration: 200 }}>
        <a
          href={resolve(`/chat/${chat.id}`)}
          class="flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors duration-150 min-w-0 no-underline {chat.locked ? 'opacity-60 ' : ''}{currentChatId !== null && currentChatId === chat.id ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'}"
          title={chat.locked ? 'Chat locked - off-topic query detected' : chat.title}
        >
          {#if chat.locked}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-secondary shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          {:else}
            <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {/if}
          <span class="truncate text-sm">{chat.title}</span>
            <span class="text-xs text-outline ml-auto shrink-0">{chat.messageCount}</span>
        </a>

        {#if showDeleteConfirm === chat.id}
          <div class="flex items-center gap-1 shrink-0">
            <button class="shrink-0 text-xs font-medium text-secondary px-2 py-1 rounded transition-colors hover:bg-secondary/20 cursor-pointer" onclick={() => ondeleteChat(chat.id)}>Delete</button>
            <button class="shrink-0 text-xs text-on-surface-variant px-1.5 py-1 rounded transition-colors hover:bg-white/10 cursor-pointer" onclick={oncancelDelete}>Cancel</button>
          </div>
        {:else}
          <button
            class="shrink-0 w-7 h-7 flex items-center justify-center rounded text-outline hover:text-secondary hover:bg-secondary/10 transition-all duration-150 cursor-pointer"
            onclick={() => onconfirmDeleteChat(chat.id)}
            aria-label="Delete chat"
          >×</button>
        {/if}
      </div>
    {/each}

    {#if chats.length === 0}
      <p class="text-on-surface-variant text-sm text-center py-8">No chats yet</p>
    {/if}
  </div>


    <!-- Sound toggle -->
  <div class="border-t border-[rgba(255,255,255,0.08)] px-3 py-2.5">
    <div class="flex items-center justify-between">
      <span class="text-xs text-on-surface-variant font-body">Sound</span>
      <SoundToggle />
    </div>
  </div>

  <!-- MCP server status -->
  {#if mcpServers.length > 0}
    <div class="border-t border-[rgba(255,255,255,0.08)] px-3 py-2.5">
      <p class="font-heading text-[10px] uppercase tracking-widest text-outline mb-2">Services</p>
      <div class="space-y-1.5">
        {#each mcpServers as server (server.id)}
          <div class="flex items-center justify-between">
            {#if server.homepage}
              <span
                role="link"
                tabindex="0"
                onclick={() => window.open(server.homepage, '_blank')}
                onkeydown={(e) => { if (e.key === 'Enter') window.open(server.homepage, '_blank'); }}
                class="font-mono text-xs text-on-surface-variant hover:text-primary transition-colors no-underline cursor-pointer"
              >{server.label || server.id}</span>
            {:else}
              <span class="font-mono text-xs text-on-surface-variant truncate">{server.label || server.id}</span>
            {/if}
            <span class="relative w-2 h-2 shrink-0">
              <span class="absolute inset-0 rounded-full {server.connected ? 'bg-emerald-400' : 'bg-red-400'}"></span>
              <span class="absolute inset-0 rounded-full {server.connected ? 'bg-emerald-400' : 'bg-red-400'} animate-ping opacity-30 {server.connected ? '' : 'hidden'}"></span>
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Slash commands reference -->
  <div class="border-t border-[rgba(255,255,255,0.08)] px-3 py-2.5">
    <p class="font-heading text-[10px] uppercase tracking-widest text-outline mb-2">Commands</p>
    <div class="space-y-1.5">
      {#each SLASH_COMMANDS as cmd (cmd.name)}
        <div class="flex items-center gap-2 justify-between">
          <span class="font-mono text-xs text-primary font-semibold shrink-0">{cmd.triggers[0]}</span>
          <span class="font-body text-[11px] text-on-surface-variant truncate">{cmd.description}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Footer -->
  <div class="flex items-center justify-end p-3 border-t border-[rgba(255,255,255,0.08)]">
    <p class="text-xs text-on-surface-variant font-mono truncate">{chats.length}/{config.public.maxChats} chats</p>
  </div>
</aside>

<!-- ─── Mobile sidebar overlay ─── -->
{#if showMobile}
  <div class="fixed inset-0 z-300 md:hidden" role="dialog">
    <div class="absolute inset-0 bg-black/50" role="presentation" onclick={() => (showMobile = false)}></div>
    <aside class="relative w-65 h-full bg-surface flex flex-col overflow-hidden">
      <div class="flex items-center justify-between p-3 border-b border-[rgba(255,255,255,0.08)]">
        <span class="font-heading text-sm text-on-surface">Chats</span>
        <button
          onclick={() => (showMobile = false)}
          class="w-6 h-6 flex items-center justify-center text-on-surface-variant hover:text-on-surface">✕</button
        >
      </div>

      <div class="p-3 border-b border-[rgba(255,255,255,0.08)]">
        <button
          class="w-full flex items-center justify-center gap-2 px-3 py-2.5 font-body text-sm text-on-surface bg-primary/10 border border-primary/25 rounded-lg cursor-pointer transition-all duration-150 hover:bg-primary/20 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
          onclick={oncreateChat}
          disabled={!canCreateChat}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            ><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
          >
          <span>New Chat</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-1">
        {#each chats as chat (chat.id)}
          <div class="relative group flex items-center gap-1">
            <a
              href={resolve(`/chat/${chat.id}`)}
              class="flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors duration-150 min-w-0 no-underline {currentChatId ===
              chat.id
                ? 'bg-surface-container-high text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'}"
              onclick={() => (showMobile = false)}
            >
              <svg
                class="shrink-0"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg
              >
              <span class="truncate text-sm">{chat.title}</span>
            </a>
          </div>
        {/each}
        {#if chats.length === 0}
          <p class="text-on-surface-variant text-sm text-center py-8">No chats yet</p>
        {/if}
      </div>


      <div class="p-3 border-t border-[rgba(255,255,255,0.08)]">
        <p class="text-xs text-on-surface-variant font-mono">{chats.length}/{config.public.maxChats} chats</p>
      </div>
    </aside>
  </div>
{/if}
