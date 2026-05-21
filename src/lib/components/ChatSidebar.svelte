<script lang="ts">

 import { resolve } from '$app/paths';
 import { SLASH_COMMANDS } from '$lib/chat/slash-commands';
 import { slide } from 'svelte/transition';
 import type { Chat } from '$lib/chat/types';
 import { config } from '$lib/config';
 import { Accordion, Collapsible } from 'sv5ui';

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
 showDesktop = true,
 fullHeight = false,
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
 showDesktop?: boolean;
 fullHeight?: boolean;
 } = $props();

 let open = $state(true);
 let mcpServers = $state<Array<{ id: string; label?: string; connected: boolean }>>([]);

 $effect(() => {
 fetch('/api/mcp/status')
 .then((r) => r.json())
 .then((data) => {
 mcpServers = data.servers;
 })
 .catch(() => {
 mcpServers = [];
 });
 });
</script>

<!-- ─── Desktop sidebar ─── -->
<aside
 class="flex flex-col overflow-hidden sticky self-start bg-surface border-r border-[rgba(255,255,255,0.08)] transition-all duration-300 max-md:hidden"
 class:hidden={!showDesktop}
 style="height: {fullHeight ? '100dvh' : 'calc(100dvh - var(--nav-height))'}; width: {open ? '320px' : '60px'}; min-width: {open ? '320px' : '60px'};"
>
 <Collapsible bind:open class="flex flex-col flex-1 overflow-hidden" ui={{ content: 'flex flex-col flex-1 min-h-0' }}>
 {#snippet trigger({ open, props })}
 <div class="flex flex-col">
 <!-- Header row: logo + toggle -->
 <div class="flex items-center justify-between p-3">
 <a href={resolve('/')} class="font-heading text-sm text-on-surface">{open ? 'woss.io' : 'w'}</a>
 <button
 {...props}
 class="size-6 flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer rounded transition-colors"
 aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
 >
 {#if open}
 <!-- chevron-left (collapse) -->
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6" /></svg>
 {:else}
 <!-- hamburger (expand) -->
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
 {/if}
 </button>
 </div>

 <!-- Collapsed state: mini "+" button -->
 {#if !open}
 <div class="flex justify-center pb-2">
 <button
 onclick={(e) => { e.stopPropagation(); oncreateChat(); }}
 disabled={!canCreateChat}
 class="size-7 flex items-center justify-center rounded text-outline hover:text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
 title={!canCreateChat ? `Maximum ${config.public.maxChats} chats` : 'New chat'}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
 </button>
 </div>
 {/if}
 </div>
 {/snippet}

 {#snippet content()}
 <!-- New Chat button (expanded) -->
 <div class="p-3 border-b border-[rgba(255,255,255,0.08)]">
 <button
 onclick={oncreateChat}
 disabled={!canCreateChat}
 class="w-full flex items-center justify-center gap-2 px-3 py-2.5 font-body text-sm text-on-surface bg-primary/10 border border-primary/25 rounded-lg cursor-pointer transition-all duration-150 hover:bg-primary/20 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
 title={!canCreateChat ? `Maximum ${config.public.maxChats} chats` : 'New chat'}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
 <span>New Chat</span>
 </button>
 </div>

 <!-- Chat list - scrollable -->
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
 <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
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
 class="shrink-0 size-7 flex items-center justify-center rounded text-outline hover:text-secondary hover:bg-secondary/10 transition-all duration-150 cursor-pointer"
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

 <!-- MCP server status -->
 {#if mcpServers.length > 0}
 <div class="px-3 pt-3 pb-1">
 <p class="text-xs font-mono uppercase tracking-wider text-outline">Services</p>
 </div>
 <div class="px-3 pb-3 space-y-1">
 {#each mcpServers as server (server.id)}
 <div class="flex items-center justify-between">
 <span class="font-mono text-xs text-on-surface-variant truncate">{server.label || server.id}</span>
 <span
 class="size-1.5 rounded-full shrink-0 {server.connected ? 'bg-[#00da8c]' : 'bg-secondary'}"
 ></span>
 </div>
 {/each}
 </div>
 {/if}

 <!-- Slash commands (accordion) -->
 <div class="px-3 pb-3">
 <Accordion
 items={[{ label: 'Slash Commands', value: 'slash-commands' }]}
 type="single"
 ui={{
 trigger: 'text-xs font-mono uppercase tracking-wider text-outline',
 body: 'pt-1 pb-2',
 root: 'w-full',
 item: 'border-0'
 }}
 >
 {#snippet content({ item })}
 <div class="space-y-1">
 {#each SLASH_COMMANDS as cmd (cmd.triggers[0])}
 <div class="flex items-center gap-2">
 <span class="font-mono text-xs text-primary">{cmd.triggers[0]}</span>
 <span class="text-xs text-on-surface-variant">{cmd.description}</span>
 </div>
 {/each}
 </div>
 {/snippet}
 </Accordion>
 </div>
 {/snippet}
 </Collapsible>

 <!-- Footer (always visible) -->
 <div class="flex items-center {open ? 'justify-between' : 'justify-center'} p-3 border-t border-[rgba(255,255,255,0.08)]">
 <SoundToggle />
 {#if open}
 <p class="text-xs text-on-surface-variant font-mono truncate">{chats.length}/{config.public.maxChats} chats</p>
 {/if}
 </div>
</aside>

<!-- ─── Mobile sidebar overlay ─── -->
{#if showMobile}
 <div class="fixed inset-0 z-300 md:hidden" role="dialog">
 <div class="absolute inset-0 bg-black/50" role="presentation" onclick={() => (showMobile = false)}></div>
 <aside class="relative size-full bg-surface flex flex-col overflow-hidden">
 <div class="flex items-center justify-between p-3 border-b border-[rgba(255,255,255,0.08)]">
 <span class="font-heading text-sm text-on-surface">Chats</span>
 <button
 onclick={() => (showMobile = false)}
 class="size-6 flex items-center justify-center text-on-surface-variant hover:text-on-surface">✕</button
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

 <!-- Slash commands accordion (mobile) -->
 <div class="p-3 border-t border-[rgba(255,255,255,0.08)] ">
 <Accordion
 items={[{ label: 'Slash Commands', value: 'slash-commands' }]}
 type="single"
 ui={{
 trigger: 'text-xs font-mono uppercase tracking-wider text-outline',
 body: 'pt-1 pb-2',
 root: 'w-full',
 item: 'border-0'
 }}
 >
 {#snippet content({ item })}
 <div class="space-y-1">
 {#each SLASH_COMMANDS as cmd (cmd.triggers[0])}
 <div class="flex items-center gap-2">
 <span class="font-mono text-xs text-primary">{cmd.triggers[0]}</span>
 <span class="text-xs text-on-surface-variant">{cmd.description}</span>
 </div>
 {/each}
 </div>
 {/snippet}
 </Accordion>
 </div>

 <div class="p-3 border-t border-[rgba(255,255,255,0.08)]">
 <p class="text-xs text-on-surface-variant font-mono">{chats.length}/{config.public.maxChats} chats</p>
 </div>
 </aside>
 </div>
{/if}
