import type { RequestEvent } from '@sveltejs/kit';
import { renameChat, getChat } from '$lib/server/db';
import { CAT, createLogger } from '$lib/server/logger';

const log = createLogger(CAT.chat);

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const;

// PATCH /api/chat/[id] — rename chat. Body: { title, userId }
export async function PATCH(event: RequestEvent): Promise<Response> {
  const chatId = event.params.id;

  if (!chatId) {
    return new Response(JSON.stringify({ error: 'chatId required' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  let body: { title?: string; userId?: string };

  try {
    body = await event.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const title = body.title;
  const userId = body.userId;

  if (!userId || typeof userId !== 'string') {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!title || typeof title !== 'string') {
    return new Response(JSON.stringify({ error: 'title required' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const chat = getChat(chatId);

  if (!chat) {
    return new Response(JSON.stringify({ error: 'Chat not found' }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  }

  if (chat.userId !== userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  try {
    renameChat(chatId, title.slice(0, 100));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    log.error`Failed to rename chat: ${err}`;
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
