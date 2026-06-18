<script lang="ts">

 import { resolve } from '$app/paths';
 import { SLASH_COMMANDS } from '$lib/chat/slash-commands';
 import { slide } from 'svelte/transition';
 import type { Chat } from '$lib/chat/types';
 import { config } from '$lib/config';
  import { Accordion, Collapsible, Button, Drawer, Icon } from 'sv5ui';

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
   <Button
   {...props}
   variant="ghost" square size="xs"
   aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
   icon={open ? 'lucide:chevron-left' : 'lucide:menu'}
   />
 </div>

 <!-- Collapsed state: mini "+" button -->
  {#if !open}
  <div class="flex justify-center pb-2">
   <Button
   variant="ghost" square size="sm"
   icon="lucide:plus"
   onclick={(e: MouseEvent) => { e.stopPropagation(); oncreateChat(); }}
   disabled={!canCreateChat}
   title={!canCreateChat ? `Maximum ${config.public.maxChats} chats` : 'New chat'}
   />
  </div>
  {/if}
 </div>
 {/snippet}

 {#snippet content()}
 <!-- New Chat button (expanded) -->
 <div class="p-3 border-b border-[rgba(255,255,255,0.08)]">
   <Button
   variant="soft" color="primary" block
   leadingIcon="lucide:plus"
   label="New Chat"
   onclick={oncreateChat}
   disabled={!canCreateChat}
   title={!canCreateChat ? `Maximum ${config.public.maxChats} chats` : 'New chat'}
   />
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
  <Icon name="lucide:lock" size={14} class="text-secondary shrink-0" />
  {:else}
  <Icon name="lucide:message-square" size={14} class="shrink-0" />
  {/if}
 <span class="truncate text-sm">{chat.title}</span>
 <span class="text-xs text-outline ml-auto shrink-0">{chat.messageCount}</span>
 </a>

  {#if showDeleteConfirm === chat.id}
  <div class="flex items-center gap-1 shrink-0">
  <Button variant="ghost" size="xs" color="error" onclick={() => ondeleteChat(chat.id)}>Delete</Button>
  <Button variant="ghost" size="xs" onclick={oncancelDelete}>Cancel</Button>
  </div>
  {:else}
   <Button
   variant="ghost" square size="xs"
   icon="lucide:x"
   onclick={() => onconfirmDeleteChat(chat.id)}
   aria-label="Delete chat"
   />
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

<!-- ─── Mobile sidebar drawer ─── -->
<Drawer bind:open={showMobile} direction="left">
  {#snippet header()}
    <span class="font-heading text-sm">Chats</span>
  {/snippet}
  {#snippet body()}
     <Button variant="soft" color="primary" block leadingIcon="lucide:plus" label="New Chat" onclick={oncreateChat} disabled={!canCreateChat} />
    <div class="flex-1 overflow-y-auto p-3 space-y-1">
      {#each chats as chat (chat.id)}
        <div class="relative group flex items-center gap-1">
          <a
            href={resolve(`/chat/${chat.id}`)}
            class="flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors duration-150 min-w-0 no-underline {currentChatId === chat.id ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'}"
            onclick={() => (showMobile = false)}
          >
             <Icon name="lucide:message-square" size={14} class="shrink-0" />
            <span class="truncate text-sm">{chat.title}</span>
          </a>
        </div>
      {/each}
      {#if chats.length === 0}
        <p class="text-on-surface-variant text-sm text-center py-8">No chats yet</p>
      {/if}
    </div>
    <div class="p-3 border-t border-[rgba(255,255,255,0.08)]">
      <Accordion
        items={[{ label: 'Slash Commands', value: 'slash-commands' }]}
        type="single"
        ui={{ trigger: 'text-xs font-mono uppercase tracking-wider text-outline', body: 'pt-1 pb-2', root: 'w-full', item: 'border-0' }}
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
  {/snippet}
</Drawer>
