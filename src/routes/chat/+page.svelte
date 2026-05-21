<script lang="ts">
 import { browser } from '$app/environment';
 import { goto } from '$app/navigation';
 import { resolve } from '$app/paths';
 import ChatSidebar from '$lib/components/ChatSidebar.svelte';
 import { createChat as createChatApi, deleteChat as deleteChatApi } from '$lib/chat/chat-crud';
 import type { Chat } from '$lib/chat/types';
 import { config } from '$lib/config';
 import { USER_ID_KEY } from '$lib/chat/constants';

 let userId = $state('');
 let chats = $state<Chat[]>([]);
 let chatsLoaded = $state(false);
 let showDeleteConfirm = $state<string | null>(null);
 let deleting = $state(false);

 // Load userId from localStorage
 $effect(() => {
 if (!browser) return;
 try {
 const stored = localStorage.getItem(USER_ID_KEY);
 if (stored) userId = stored;
 } catch { /* ignore */ }
 });

 // Load chats when userId is available
 $effect(() => {
 if (!browser || !userId || chatsLoaded) return;
 fetch(`/api/chat?userId=${encodeURIComponent(userId)}`)
 .then(r => r.json())
 .then(d => { chats = d.chats; chatsLoaded = true; })
 .catch(() => { chatsLoaded = true; });
 });

 let canCreateChat = $derived(chats.length < config.public.maxChats);

 async function createChat(): Promise<void> {
 if (!canCreateChat) return;
 const id = await createChatApi(userId);
 if (id) goto(resolve(`/chat/${id}`));
 }

 function confirmDeleteChat(chatId: string): void {
 showDeleteConfirm = chatId;
 }

 async function deleteChat(chatId: string): Promise<void> {
 if (deleting) return;
 deleting = true;
 showDeleteConfirm = null;
 const ok = await deleteChatApi(userId, chatId);
 if (ok) {
 chats = chats.filter((c) => c.id !== chatId);
 }
 deleting = false;
 }
</script>

<svelte:head>
 <title>Chats — woss</title>
</svelte:head>

<div class="flex" style="height: 100dvh;">
 <ChatSidebar
 {chats}
 currentChatId={null}
 {canCreateChat}
 {showDeleteConfirm}
 showMobile={true}
 oncreateChat={createChat}
 onconfirmDeleteChat={confirmDeleteChat}
 ondeleteChat={deleteChat}
 oncancelDelete={() => (showDeleteConfirm = null)}
 fullHeight
 />

 <!-- Welcome area when no chat is selected -->
 <div class="flex-1 flex items-center justify-center bg-surface">
 <div class="text-center px-8">
 <h1 class="text-2xl font-heading font-semibold text-on-surface mb-2">Chats</h1>
 <p class="text-on-surface-variant text-sm max-w-md">
 Select a chat from the sidebar or create a new one to get started.
 </p>
 </div>
 </div>
</div>
