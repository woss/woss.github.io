import type { RequestEvent } from '@sveltejs/kit';
import { getMessages, getMessagesByUserId, clearChatMessages, getChat } from '$lib/server/db';
import { CAT, createLogger } from '$lib/server/logger';

const log = createLogger(CAT.chat);

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const;

/**
 * GET /api/chat/history
 * Accepts either:
 * - chatId (new): get messages for a specific chat
 * - userId (legacy fallback): get all messages for a user
 */
export async function GET(event: RequestEvent): Promise<Response> {
  const chatId = event.url.searchParams.get('chatId');
  const userId = event.url.searchParams.get('userId');

  // Prefer chatId if both provided
  if (chatId) {
    try {
      const messages = getMessages(chatId, 50, 0);
      return new Response(JSON.stringify({ messages }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    } catch (err) {
      log.error`Failed to load chat history: ${err}`;
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }
  }

  // Fallback to userId (legacy behavior)
  if (!userId) {
    return new Response(JSON.stringify({ error: "Query parameter 'chatId' or 'userId' is required" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const messages = getMessagesByUserId(userId, 50, 0);
    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    log.error`Failed to load chat history: ${err}`;
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

/**
 * DELETE /api/chat/history?chatId=xxx&userId=xxx — clear messages for a chat (ownership check)
 */
export async function DELETE(event: RequestEvent): Promise<Response> {
  const chatId = event.url.searchParams.get('chatId');
  const userId = event.url.searchParams.get('userId');

  if (!chatId) {
    return new Response(JSON.stringify({ error: 'chatId required' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
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
    clearChatMessages(chatId);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    log.error`Failed to clear chat messages: ${err}`;
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
