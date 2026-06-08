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
  renameChat,
  searchChunks,
} from '$lib/server/db';
import { embedText } from '$lib/server/embed';
import { buildRagPrompt, chatStream, chatStreamWithTools, isAvailable } from '$lib/server/llm';
import { checkCache, storeCache } from '$lib/server/llm-cache';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { getMcpToolDefs, getMcpResourceContent, getSystemPromptAddition } from '$lib/server/mcp/tools';
import { config } from '$lib/server/config';
import { config as clientConfig } from '$lib/config';
import type { RequestEvent } from '@sveltejs/kit';
import { CAT, createLogger } from '$lib/server/logger';
import { classifyQuery } from '$lib/query-classifier';
import type { QueryClass } from '$lib/query-classifier';
import { Effect, Stream } from 'effect';

const log = createLogger(CAT.chat);

interface AskBody {
  text?: string;
  maxChunks?: number;
  userId: string;
  chatId?: string;
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

function getClientIP(event: RequestEvent): string {
  return event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? event.getClientAddress();
}

function tryRenameChat(chatId: string, text: string): void {
  try {
    const chat = getChat(chatId);
    if (chat && chat.title === 'New Chat') renameChat(chatId, text.slice(0, 40));
  } catch (err) {
    log.error`auto-rename failed: ${err}`;
  }
}

function needsGithubTools(text: string, ctxMessages?: { role: string; content: string }[]): boolean {
  const t = text.toLowerCase();
  const referencesDaniel = /\b(daniel(?:'?s)?|woss|anagolay|idiyanale|sensio|macula)\b/i.test(t);
  const contextReferencesDaniel =
    !referencesDaniel &&
    ctxMessages?.some(
      (m) =>
        m.role === 'user' && /\b(daniel(?:'?s)?|woss|anagolay|idiyanale|sensio|macula)\b/i.test((m.content ?? '').toLowerCase()),
    );
  const hasKeyword = /pr|pull request|commit|issue|repo|repository|github|stars|fork|contrib/.test(t);
  if (hasKeyword) return true;
  if (!referencesDaniel && !contextReferencesDaniel) {
    const wc = t.split(/\s+/).filter(Boolean).length;
    if (wc > 6) return false;
  }
  return false;
}

function needsMaculaTools(text: string, ctxMessages?: { role: string; content: string }[]): boolean {
  const t = text.toLowerCase();
  const referencesDaniel = /\b(daniel(?:'?s)?|woss|anagolay|idiyanale|sensio|macula)\b/i.test(t);
  const contextReferencesDaniel =
    !referencesDaniel &&
    ctxMessages?.some(
      (m) =>
        m.role === 'user' && /\b(daniel(?:'?s)?|woss|anagolay|idiyanale|sensio|macula)\b/i.test((m.content ?? '').toLowerCase()),
    );
  const hasKeyword = /macula|image|photo|picture|video|media|file|asset|keyword|license|metadata|exif|portfolio|art|music|hobbies?|interests?/.test(t);
  if (hasKeyword) return true;
  if (!referencesDaniel && !contextReferencesDaniel) {
    const wc = t.split(/\s+/).filter(Boolean).length;
    if (wc > 6) return false;
  }
  return false;
}

/**
 * Fast binary relevance check — is this message about Daniel Maricic?
 * Uses same LLM provider with temperature=0, max_tokens=5.
 * Fail-open: returns true on any error/timeout so legitimate queries aren't blocked.
 */
async function isRelevant(
  question: string,
  history: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<boolean> {
  // Fast bypass for polite closings, gratitude, contact requests — always relevant
  const politePattern =
    /^(thank(s| you|you!)|thanks|cheers|ty|thx|great|awesome|perfect|got it|ok|okay|sure|nice|good|cool|that('s| is) all|that helps|bye|have a good|contact|hire|reach out|get in touch|talk to|speak with)/i;
  if (politePattern.test(question.trim())) {
    return true;
  }

  const context = history
    .slice(-2)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  try {
    const content =
      "Is this message about Daniel Maricic's professional portfolio, " +
      'skills, experience, projects, or career history?' +
      (context ? `\n\nPrevious context:\n${context}` : '') +
      `\n\nMessage: ${question}`;
    const response = await fetch(`${config().openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config().openai.apiKey}`,
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        model: config().openai.model,
        // OpenRouter: hide reasoning
        provider: { reasoning_type: 'hidden' },
        // Fallback for other APIs
        extra_body: { reasoning_effort: 'none' },
        messages: [
          {
            role: 'system',
            content: `You are a classifier for a professional portfolio website. Determine if the user's message is relevant to Daniel Maricic's work. Answer exactly one word: yes or no.

RELEVANT (answer yes): Questions about his skills, experience, projects, career history. Expressions of gratitude (thank you, thanks, appreciate it). Requests to contact, hire, or collaborate. Polite conversation closings. Follow-ups continuing an already-relevant topic. Messages with his name or project names.

NOT RELEVANT (answer no): Questions about politics, sports, entertainment, weather, general knowledge, math, coding help not related to his projects, or anything completely unrelated to Daniel Maricic's professional portfolio.

Respond only with "yes" or "no".`,
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0,
        max_tokens: 5000,
      }),
      signal: signal ?? AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      log.warn`Relevance check HTTP ${response.status} — allowing query (fail-open)`;
      return true;
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    const msg = body.choices?.[0]?.message;
    const answer = (msg?.content ?? msg?.reasoning_content ?? '').trim().toLowerCase();
    return answer === 'yes';
  } catch (err) {
    log.warn`Relevance check failed: ${err} — allowing query (fail-open)`;
    return true;
  }
}

/**
 * Generate a warm response for polite-only messages (thanks, positive feedback).
 * No RAG, no tools — just a friendly reply.
 */
async function generatePoliteResponse(message: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${config().openai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config().openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config().openai.model,
      provider: { reasoning_type: 'hidden' },
      extra_body: { reasoning_effort: 'none' },
      messages: [
        {
          role: 'system',
          content: `You are Daniel Maricic's friendly AI assistant. The user has sent a polite message or positive feedback. Respond warmly, naturally, and briefly (1-2 sentences). Do NOT mention specific projects, skills, or portfolio items. Keep it light and friendly.`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 100,
    }),
    signal: signal ?? AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
  };
  const msg = body.choices?.[0]?.message;
  return (msg?.content ?? msg?.reasoning_content ?? '').trim();
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

  // Save user message immediately
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
    userAgentId,
  );

  // Start background generation (non-blocking, no await)
  const chatId = body.chatId;
  if (chatId) {
    startGeneration(text, chatId, body.userId, maxChunks, userAgentId);
  }

  // Return 202 — generation continues in background
  return new Response(JSON.stringify({ accepted: true, chatId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function startGeneration(
  text: string,
  chatId: string,
  userId: string,
  maxChunks: number,
  userAgentId?: number,
): Promise<void> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 120_000);
  timeoutId?.unref?.();

  const startTime = performance.now();
  log.info`📝 ask: "${text.slice(0, 100)}" [chatId=${chatId} userId=${userId}]`;

  try {
    // Publish user_message event
    publishPersistent(chatId, 'user_message', { text, userId });

    // 1a. Check relevance — reject off-topic questions early
    // Slash commands bypass the relevance gate (user-initiated actions are always on-topic)
    const ctxMessages = getMessages(chatId, 50);
    const history = ctxMessages.map((m) => ({ role: m.role, content: m.content }));
    if (!text.startsWith('/summarize')) {
      // Bypass LLM relevance check when explicit tool keywords match —
      // needsGithubTools / needsMaculaTools are keyword-based and already
      // confirm the query is about Daniel's work (Daniel ref + operation keyword)
      const hasToolIntent = needsGithubTools(text, ctxMessages) || needsMaculaTools(text, ctxMessages);
      if (!hasToolIntent) {
        publishLive(chatId, 'status', { step: 'checking_relevance' });
        const relevant = await isRelevant(text, history, abortController.signal);
        if (!relevant) {
          lockChat(chatId);

          const errMsgId = addMessage(
            userId,
            'assistant',
            '',
            undefined,
            undefined,
            chatId,
            0,
            0,
            0,
            0,
            0,
            true,
            "I can only answer questions about Daniel Maricic's professional portfolio and experience.",
            undefined,
            userAgentId,
          );
          await callWebhook({
            type: 'chatLocked',
            chatId,
            reason: `off-topic question. Chat has ${ctxMessages.length} messages, ${getChatMessageCount(chatId)} total messages. Last message: "${text.slice(0, 100)}" with id ${errMsgId}`,
          });
          publishPersistent(chatId, 'error', {
            message: "I can only answer questions about Daniel Maricic's professional portfolio and experience.",
            irrecoverable: true,
            messageId: errMsgId,
          });
          return;
        }
      }
    }

    // 1b. Polite-only messages — skip embedding, RAG, tools. Just respond warmly.
    const politeOnlyPattern =
      /^(thank(s| you|you!)|thanks|cheers|ty|thx|great|awesome|perfect|got it|ok|okay|sure|nice|good|cool|that('s| is) all|that helps|bye|have a good)/i;
    if (politeOnlyPattern.test(text.trim())) {
      publishLive(chatId, 'status', { step: 'generating' });
      try {
        const politeResponse = await generatePoliteResponse(text, abortController.signal);
        const msgId = addMessage(
          userId,
          'assistant',
          politeResponse,
          '',
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
          userAgentId,
        );
        publishPersistent(chatId, 'done', {
          answer: politeResponse,
          sources: [],
          messageId: msgId,
          usage: { chunks: 0, totalTime: Math.floor(performance.now() - startTime), cached: false },
        });
      } catch {
        const fallback = "You're welcome! I'm glad I could help. Feel free to ask more about Daniel's work.";
        const msgId = addMessage(
          userId,
          'assistant',
          fallback,
          '',
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
          userAgentId,
        );
        publishPersistent(chatId, 'done', {
          answer: fallback,
          sources: [],
          messageId: msgId,
          usage: { chunks: 0, totalTime: Math.floor(performance.now() - startTime), cached: false },
        });
      }
      tryRenameChat(chatId, text);
      return;
    }

    // 1. Embed query
    publishLive(chatId, 'status', { step: 'embedding' });
    let embedding: { data: number[]; dimensions: number };
    try {
      embedding = await embedText(text);
    } catch {
      const errMsgId = addMessage(
        userId,
        'assistant',
        '',
        undefined,
        undefined,
        chatId,
        0,
        0,
        0,
        0,
        0,
        undefined,
        'Failed to generate embedding',
        undefined,
        userAgentId,
      );
      publishPersistent(chatId, 'error', { message: 'Failed to generate embedding', messageId: errMsgId });
      return;
    }

    // 2. Build composite cache key
    let cacheText = text;
    let cacheEmbeddingData = embedding.data;
    // ctxMessages loaded earlier in step 1a
    const userMessages = ctxMessages.filter((m) => m.role === 'user');
    if (userMessages.length > 1 && userMessages[userMessages.length - 2].content !== text) {
      cacheText = `${userMessages[userMessages.length - 2].content} ${text}`;
      try {
        const ce = await embedText(cacheText);
        cacheEmbeddingData = ce.data;
      } catch {
        /* fallback */
      }
    }

    // 3. Check semantic cache (skip if disabled via env)
    let cached: { answer: string; sources: string } | null = null;
    if (config().llmCache.enabled) {
      publishLive(chatId, 'status', { step: 'checking_cache' });
      cached = checkCache(cacheEmbeddingData);
    }
    if (cached) {
      log.info`📦 cache HIT for "${text.slice(0, 100)}"`;
      // Cache hit — persist assistant response and emit done
      const msgId = addMessage(
        userId,
        'assistant',
        cached.answer,
        cached.sources,
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
        userAgentId,
      );
      const sources = JSON.parse(cached.sources) as { title: string; score: number; slug?: string; url?: string }[];
      const elapsed = performance.now() - startTime;
      publishPersistent(chatId, 'done', {
        answer: cached.answer,
        sources,
        messageId: msgId,
        usage: { chunks: 0, totalTime: Math.floor(elapsed), cached: true },
      });

      tryRenameChat(chatId, text);
      return;
    }

    // 4. Classify query — skip RAG for tool-only, skip tools for rag
    const queryType: QueryClass = classifyQuery(embedding.data);
    log.info`🎯 queryType=${queryType} "${text.slice(0, 80)}"`;

    // 5. RAG search (skip for tool-only queries)
    let ragChunks: { title: string; text: string; score: number }[] = [];
    let sources: { title: string; score: number; slug: string; url: string }[] = [];

    if (queryType !== 'tool') {
      publishLive(chatId, 'status', { step: 'searching' });
      const typeFilter = /\b(blog|post|article|writing|tutorial|guide)\b/i.test(text)
        ? ('post' as const)
        : ('experience' as const);

      const results = searchChunks(embedding.data, maxChunks, typeFilter);
      const filtered = results.filter((r) => r.score < 1.5).slice(0, maxChunks);

      ragChunks = filtered.map((r) => ({
        title: r.chunk.title,
        text: r.chunk.text,
        score: r.score,
      }));

      const seen = new Set<string>();
      sources = filtered
        .filter((r) => {
          if (seen.has(r.chunk.slug)) return false;
          seen.add(r.chunk.slug);
          return true;
        })
        .map((r) => ({
          title: r.chunk.title,
          score: r.score,
          slug: r.chunk.slug,
          url: r.chunk.type === 'post' ? `/posts/${r.chunk.slug}` : `/experience/${r.chunk.slug}`,
        }));
    }

    // For /summarize, use all unique sources from conversation history instead of RAG results.
    // RAG search on "/summarize" returns chunks unrelated to the conversation topics.
    if (text.startsWith('/summarize')) {
      ragChunks = [];
      const seen = new Set<string>();
      sources = ctxMessages
        .filter((m) => m.role === 'assistant' && m.sources)
        .flatMap((m) => {
          try {
            return JSON.parse(m.sources!) as { title: string; score: number; slug?: string; url?: string }[];
          } catch {
            return [];
          }
        })
        .filter((s) => {
          if (!s.slug) return false;
          if (seen.has(s.slug)) return false;
          seen.add(s.slug);
          return true;
        })
        .map((s) => ({
          title: s.title,
          score: s.score,
          slug: s.slug!,
          url: s.url ?? '',
        }));
    }

    tryRenameChat(chatId, text);

    // 6. Build RAG prompt
    const messages = buildRagPrompt(text, ragChunks, history);

    // 6b. Conditionally load MCP tools — detect which tool categories are needed
    let mcpToolDefs: any[] | null = null;
    const githubNeeded = needsGithubTools(text, ctxMessages);
    const maculaNeeded = needsMaculaTools(text, ctxMessages);

    // Fetch MCP resource content for system prompt (macula only)
    let resourceContent = '';
    if (maculaNeeded) {
      try {
        resourceContent = await getMcpResourceContent('macula');
      } catch (err) {
        log.error`Failed to fetch MCP resources: ${err}`;
      }
    }

    if (githubNeeded || maculaNeeded) {
      try {
        const toolDefs = await getMcpToolDefs();
        if (toolDefs.length > 0) {
          mcpToolDefs = toolDefs;
          log.info`🔧 tools: ${toolDefs.map((t: any) => t.name).join(', ')}`;
          // Inject tool awareness into system prompt (always first message)
          if (messages.length > 0 && messages[0].role === 'system') {
            let additions = getSystemPromptAddition({ github: githubNeeded, macula: maculaNeeded });
            if (resourceContent) additions += '\n\n' + resourceContent;
            messages[0] = {
              ...messages[0],
              content: messages[0].content + '\n\n' + additions,
            };
          }
        }
      } catch (err) {
        log.error`Failed to load MCP tools: ${err}`;
        // Non-fatal — continue without tools
      }
    } else {
      log.info`📚 RAG-only mode (no external tools needed for this query)`;
    }

    // Build tool name → serverId map for tool timing instrumentation
    const toolServerMap = new Map<string, string>();
    for (const def of mcpToolDefs ?? []) {
      toolServerMap.set(def.name, def.serverId ?? 'unknown');
    }

    // 7. Stream from OpenRouter
    publishLive(chatId, 'status', { step: 'generating' });
    let lastError: Error | null = null;
    let partial = false;
    let answerText = '';
    let reasoningText = '';

    let currentModelId = 0;
    let tokenUsage = { promptTokens: 0, completionTokens: 0 };
    let responseMs = 0;
    let maxTokens = 0;

    log.debug`mcpToolDefs: ${mcpToolDefs?.map((t) => t.name).join(', ') ?? 'none'}`;

    let anyStepHadToolCalls = false;

    // Pre-generate message ID for tool-call FK tracking
    const db = getDb();
    const msgId = crypto.randomUUID();
    const toolCallStmt = db.prepare(
      `INSERT INTO tool_calls (id, message_id, name, server_id, tool_input) VALUES (?, ?, ?, ?, ?)`,
    );
    const toolCallFinishStmt = db.prepare(
      `UPDATE tool_calls SET finished_at = datetime('now'), result_size = ? WHERE id = ?`,
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const llmStream = mcpToolDefs
          ? chatStreamWithTools(messages, mcpToolDefs, abortController.signal)
          : chatStream(messages, abortController.signal);

        const streamStartTime = performance.now();

        await Effect.runPromise(
          Stream.runForEach(llmStream, (event: any) =>
            Effect.sync(() => {
              switch (event.type) {
                case 'text-delta':
                  answerText += event.text;

                  publishLive(chatId, 'token', { token: event.text });
                  break;
                case 'reasoning-delta':
                  reasoningText += event.text;
                  break;
                case 'finish': {
                  if (event.actualModelName || event.modelName) {
                    currentModelId = ensureModel(
                      event.provider ?? String(config().openai.baseUrl),
                      event.modelName ?? config().openai.model,
                      event.actualModelName ?? event.modelName ?? config().openai.model,
                      event.maxTokens ?? config().openai.maxTokens,
                    );
                  }
                  if (event.usage) {
                    tokenUsage = {
                      promptTokens: event.usage.inputTokens ?? 0,
                      completionTokens: event.usage.outputTokens ?? 0,
                    };
                  }
                  maxTokens = event.maxTokens ?? config().openai.maxTokens;
                  responseMs = Math.floor(performance.now() - streamStartTime);
                  break;
                }
                case 'step-finish':
                  if (event.toolCalls > 0) anyStepHadToolCalls = true;
                  break;
                case 'tool-call':
                  log.debug`Tool call: ${event.name}(${JSON.stringify(event.input)})`;
                  try {
                    toolCallStmt.run(
                      event.id,
                      msgId,
                      event.name,
                      toolServerMap.get(event.name) ?? 'unknown',
                      JSON.stringify(event.input ?? {}),
                    );
                  } catch (e) {
                    log.error`Failed to record tool call: ${e}`;
                  }
                  break;
                case 'tool-result':
                  log.debug`Tool result: ${event.name}`;
                  try {
                    const resultSize =
                      typeof event.result === 'string' ? event.result.length : JSON.stringify(event.result).length;
                    toolCallFinishStmt.run(resultSize, event.id);
                  } catch (e) {
                    log.error`Failed to record tool result: ${e}`;
                  }
                  break;
              }
            }),
          ),
        );
        log.debug`RAW_LLM_OUTPUT:\n${answerText}`;

        // Post-stream: convert GitHub PR/issue references to clickable markdown links
        answerText = answerText.replace(
          /([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)\s*\(#(\d+)\)/g,
          '[$1#$2](https://github.com/$1/pull/$2)',
        );

        // Flatten nested markdown lists — strip indentation before list markers
        answerText = answerText.replace(/^(\s{2,})([-*+]\s)/gm, '$2');

        lastError = null;

        // Retry if answer is empty or doom loop detected (tools called but no text produced)
        // Doom loop: tools called AND no text produced AND answer still empty
        const isDoomLoop = anyStepHadToolCalls && answerText.trim().length === 0;
        if (answerText.trim().length === 0 || isDoomLoop) {
          log.warn`${answerText.trim().length === 0 ? 'Empty answer' : 'Doom loop'} detected, retrying (attempt ${attempt + 1})`;
          if (messages.length > 0 && messages[0].role === 'system') {
            messages[0] = {
              ...messages[0],
              content:
                messages[0].content +
                '\n\nMANDATORY INSTRUCTION: Your previous response was a failure — you called tools but produced NO answer text. You are being retried. For this attempt: DO NOT call any tools. IGNORE any available tools. Use only the information you already have and write a complete, well-formatted answer immediately. Even if you have nothing to say, write SOMETHING — a greeting, an apology, anything. Producing NO text is unacceptable. You MUST write at least one sentence.',
            };
          }
          lastError = new Error(answerText.trim().length === 0 ? 'Empty answer' : 'Doom loop');
          mcpToolDefs = null;
          continue;
        }

        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errorStack = err instanceof Error ? err.stack : 'no stack';
        log.error`Stream attempt ${attempt + 1} failed: ${lastError.message} stack=${errorStack}`;
        if (abortController.signal.aborted) {
          partial = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }

    // If tools were called, clear sources (RAG sources don't apply to tool results)
    if (anyStepHadToolCalls) {
      sources = [];
    }

    // 8. Emit completion or error — save fallback message so error persists across page refreshes
    if (lastError && !partial) {
      const fallbackText = answerText.trim()
        ? answerText
        : "I'm sorry, I wasn't able to generate a response. Please try rephrasing your question.";
      let errMsgId = '';
      try {
        errMsgId = addMessage(
          userId,
          'assistant',
          fallbackText,
          JSON.stringify(sources),
          reasoningText,
          chatId,
          currentModelId,
          tokenUsage.promptTokens,
          tokenUsage.completionTokens,
          responseMs,
          maxTokens,
          undefined,
          undefined,
          undefined,
          userAgentId,
        );
        log.debug`Saved fallback error message with id ${errMsgId}`;
      } catch (e) {
        log.error`Failed to save fallback error message: ${e}`;
      }
      const retryErrMsgId = addMessage(
        userId,
        'assistant',
        '',
        JSON.stringify(sources ?? []),
        undefined,
        chatId,
        currentModelId,
        tokenUsage?.promptTokens ?? 0,
        tokenUsage?.completionTokens ?? 0,
        responseMs,
        0,
        undefined,
        'Failed to generate answer after retries',
        undefined,
        userAgentId,
      );
      publishPersistent(chatId, 'error', {
        message: 'Failed to generate answer after retries',
        messageId: retryErrMsgId,
      });
      return;
    }

    // Save assistant message
    try {
      addMessage(
        userId,
        'assistant',
        answerText,
        JSON.stringify(sources),
        reasoningText,
        chatId,
        currentModelId,
        tokenUsage.promptTokens,
        tokenUsage.completionTokens,
        responseMs,
        maxTokens,
        undefined,
        undefined,
        msgId,
        userAgentId,
      );
    } catch (err) {
      log.error`addMessage failed: ${err}`;
      const errMsgId = addMessage(
        userId,
        'assistant',
        '',
        undefined,
        undefined,
        chatId,
        0,
        0,
        0,
        0,
        0,
        undefined,
        'Failed to save response',
        undefined,
        userAgentId,
      );
      publishPersistent(chatId, 'error', { message: 'Failed to save response', messageId: errMsgId });
      return;
    }

    // Store cache (skip if disabled via env)
    if (config().llmCache.enabled && !partial) {
      try {
        storeCache(cacheEmbeddingData, cacheText, answerText, JSON.stringify(sources), msgId);
      } catch (err) {
        log.error`storeCache failed: ${err}`;
      }
    }
    log.info`✅ done: tokensIn=${tokenUsage.promptTokens} tokensOut=${tokenUsage.completionTokens} durationMs=${responseMs} answerLen=${answerText.length} partial=${partial}`;

    const elapsed = performance.now() - startTime;
    publishPersistent(chatId, 'done', {
      answer: answerText,
      sources,
      messageId: msgId,
      usage: {
        chunks: ragChunks.length,
        totalTime: Math.floor(elapsed),
        modelId: currentModelId,
        tokensIn: tokenUsage.promptTokens,
        tokensOut: tokenUsage.completionTokens,
        durationMs: responseMs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error`Background generation failed: ${err}`;
    try {
      const errMsgId = addMessage(
        userId,
        'assistant',
        '',
        undefined,
        undefined,
        chatId,
        0,
        0,
        0,
        0,
        0,
        undefined,
        message,
        undefined,
        userAgentId,
      );
      publishPersistent(chatId, 'error', { message, messageId: errMsgId });
    } catch {
      /* ignore */
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
