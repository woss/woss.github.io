import { publishLive, publishPersistent } from '$lib/server/chat-events';
import { callWebhook } from '$lib/server/webhooks';
import {
  addMessage,
  ensureModel,
  getChat,
  getChatMessageCount,
  getDb,
  getMessages,
  getOrCreateUserAgent,
  isChatLocked,
  lockChat,
  searchChunks,
} from '$lib/server/db';
import { embedText } from '$lib/server/embed';
import { buildRagPrompt, chatStream, chatStreamWithTools, isAvailable } from '$lib/server/llm';
import { checkCache, storeCache } from '$lib/server/llm-cache';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { getMcpToolDefs, getMcpResourceContent, type McpToolDef } from '$lib/server/mcp/tools';
import { config } from '$lib/server/config';
import { config as clientConfig } from '$lib/config';
import type { RequestEvent } from '@sveltejs/kit';
import { CAT, createLogger } from '$lib/server/logger';
import { classifyQuery } from '$lib/query-classifier';
import type { QueryClass } from '$lib/query-classifier';
import { Effect, Stream } from 'effect';
import {
  generatePoliteResponse,
  isRelevant,
  needsGithubTools,
  needsMaculaTools,
  sanitizeText,
  tryRenameChat,
} from '$lib/server/chat-helpers';
import { startGeneration } from '$lib/server/generate';
import { generateTraceId, generateSpanId, withTrace } from '$lib/server/trace-context';
import { dev } from '$app/environment';

const log = createLogger(CAT.chat);

interface AskBody {
  text?: string;
  maxChunks?: number;
  userId: string;
  chatId?: string;
}

function getClientIP(event: RequestEvent): string {
  return event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? event.getClientAddress();
}

export async function POST(event: RequestEvent): Promise<Response> {
  let body: AskBody;
  try {
    body = await event.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.text || typeof body.text !== 'string') {
    return new Response(JSON.stringify({ error: "Field 'text' is required" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const text = sanitizeText(body.text);
  if (!text) {
    return new Response(JSON.stringify({ error: "Field 'text' is required" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (text.length > 500) {
    return new Response(JSON.stringify({ error: "Field 'text' must be 500 characters or fewer" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const maxChunks = body.maxChunks ?? 6;
  if (!Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 20) {
    return new Response(JSON.stringify({ error: "'maxChunks' must be an integer between 1 and 20" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.userId || typeof body.userId !== 'string') {
    return new Response(JSON.stringify({ error: "Field 'userId' is required" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (body.chatId) {
    const msgCount = getChatMessageCount(body.chatId);
    if (msgCount >= clientConfig.public.maxMessages) {
      return new Response(
        JSON.stringify({ error: `Chat has reached maximum of ${clientConfig.public.maxMessages} messages` }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  const ip = getClientIP(event);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil((rateCheck.resetAt - Date.now()) / 1000);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateCheck.resetAt }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, retryAfter)),
      },
    });
  }

  const userAgentId = event.request.headers.get('user-agent')
    ? getOrCreateUserAgent(event.request.headers.get('user-agent')!, ip)
    : undefined;

  if (!(await isAvailable())) {
    return new Response(JSON.stringify({ error: 'AI service is not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Reject messages to locked chats
  if (body.chatId && isChatLocked(body.chatId)) {
    return new Response(JSON.stringify({ error: 'This chat has been locked', locked: true }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Enforce ownership for existing chats
  if (body.chatId) {
    const chat = getChat(body.chatId);
    if (!dev && chat && chat.userId !== body.userId) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Generate message traceId for this exchange (covers user msg + LLM calls + assistant msg)
  const msgTraceId = generateTraceId();

  // Save user message inside the trace context so addMessage stores this traceId
  const userMsgId = withTrace(msgTraceId, generateSpanId(), () =>
    addMessage(
      body.userId,
      'user',
      text,
      undefined,
      undefined,
      body.chatId,
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
    ),
  );

  // Start background generation (non-blocking, no await)
  const chatId = body.chatId;
  if (chatId) {
    startGeneration(text, chatId, body.userId, maxChunks, userAgentId, userMsgId, msgTraceId);
  }

  // Return 202 — generation continues in background
  return new Response(JSON.stringify({ accepted: true, chatId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}


