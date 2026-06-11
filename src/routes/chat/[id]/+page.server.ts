import { error, fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad, Actions } from './$types';
import {
  getMessages,
  getChatMessageCount,
  lockChat,
  isChatLocked,
  addMessage,
  getOrCreateUserAgent,
  deleteChat,
  getChat,
  getToolCallsForMessages,
} from '$lib/server/db';
import { config as clientConfig } from '$lib/config';
import { callWebhook } from '$lib/server/webhooks';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { isAvailable } from '$lib/server/llm';
import { startGeneration } from '$lib/server/generate';

function getClientIP(event: import('@sveltejs/kit').RequestEvent): string {
  return event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? event.getClientAddress();
}

function sanitizeText(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

export const actions: Actions = {
  ask: async (event) => {
    const chatId = event.params.id;
    if (!chatId) return fail(400, { error: 'chatId required' });

    const fd = await event.request.formData();
    const text = sanitizeText(String(fd.get('text') ?? ''));
    const userId = String(fd.get('userId') ?? '');

    if (!text) return fail(400, { error: 'text is required' });
    if (text.length > 500) return fail(400, { error: 'text must be 500 characters or fewer' });

    let maxChunks = parseInt(String(fd.get('maxChunks') ?? '6'), 10);
    if (!Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 20) maxChunks = 6;

    if (!userId || typeof userId !== 'string') return fail(400, { error: 'userId required' });

    const msgCount = getChatMessageCount(chatId);
    if (msgCount >= clientConfig.public.maxMessages) {
      lockChat(chatId);
      return fail(400, {
        error: `Chat has reached maximum of ${clientConfig.public.maxMessages} messages`,
        locked: true,
      });
    }

    const ip = getClientIP(event);
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) return fail(429, { error: 'Rate limit exceeded', resetAt: rateCheck.resetAt });

    const userAgentId = event.request.headers.get('user-agent')
      ? getOrCreateUserAgent(event.request.headers.get('user-agent')!, ip)
      : undefined;

    if (!(await isAvailable())) return fail(503, { error: 'AI service is not available' });

    if (isChatLocked(chatId)) return fail(400, { error: 'This chat has been locked', locked: true });

    const chat = getChat(chatId);
    if (!chat) return fail(404, { error: 'Chat not found' });
    if (!dev && chat.userId !== userId) return fail(403, { error: 'Not authorized' });

    addMessage(
      userId,
      'user',
      text,
      undefined,
      undefined,
      chatId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userAgentId,
    );

    startGeneration(text, chatId, userId, maxChunks, userAgentId);

    return { accepted: true, chatId };
  },

  delete: async (event) => {
    const fd = await event.request.formData();
    const chatId = String(fd.get('chatId') ?? '');
    const userId = String(fd.get('userId') ?? '');
    if (!chatId) return fail(400, { error: 'chatId required' });
    if (!userId) return fail(400, { error: 'userId required' });

    const chat = getChat(chatId);
    if (!chat) return fail(404, { error: 'Chat not found' });
    if (!dev && chat.userId !== userId) return fail(403, { error: 'Not authorized' });

    deleteChat(chatId);
    callWebhook({ type: 'chatDeleted', chatId });

    return { success: true, chatId };
  },

  'store-message': async (event) => {
    const chatId = event.params.id;
    if (!chatId) return fail(400, { error: 'chatId required' });

    const fd = await event.request.formData();
    const userId = String(fd.get('userId') ?? '');
    const role = String(fd.get('role') ?? '');
    const content = String(fd.get('content') ?? '');

    if (!userId) return fail(400, { error: 'userId required' });
    if (!role) return fail(400, { error: 'role required' });
    if (role !== 'user' && role !== 'assistant') return fail(400, { error: 'role must be user or assistant' });
    if (!content) return fail(400, { error: 'content required' });

    const chat = getChat(chatId);
    if (!chat) return fail(404, { error: 'Chat not found' });
    if (!dev && chat.userId !== userId) return fail(403, { error: 'Not authorized' });

    addMessage(userId, role, content, undefined, undefined, chatId);

    return { success: true };
  },
};

export const load: PageServerLoad = async ({ params }) => {
  const chatId = params.id;
  if (!chatId) {
    error(400, 'chatId required');
  }
  const chat = getChat(chatId);
  if (!chat) error(404, 'This chat is no longer available.');

  const storedMessages = getMessages(chatId, 50, 0);
  // Batch fetch tool calls for all messages
  const messageIds = storedMessages.map((m) => m.id);
  const toolCallsByMessage = getToolCallsForMessages(messageIds);
  const messages = storedMessages.map((m) => ({
    id: m.id,
    role: m.role === 'system' ? 'assistant' : m.role === 'user' ? 'user' : 'assistant',
    text: m.content || '',
    sources: m.sources ? JSON.parse(m.sources) : undefined,
    reasoning: m.reasoning || undefined,
    error: m.error || undefined,
    irrecoverable: m.irrecoverable || undefined,
    timestamp: new Date(m.createdAt).getTime() || Date.now(),
    createdAt: m.createdAt,
    modelId: m.modelId || 0,
    tokensIn: m.tokensIn || 0,
    tokensOut: m.tokensOut || 0,
    durationMs: m.durationMs || 0,
    deletedAt: m.deletedAt || undefined,
    toolCalls: toolCallsByMessage[m.id] || [],
  }));
  return { messages, locked: chat.locked, chatOwnerId: chat.userId };
};
