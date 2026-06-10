import { publishLive, publishPersistent } from '$lib/server/chat-events';
import { callWebhook } from '$lib/server/webhooks';
import {
  addMessage,
  ensureModel,
  getChatMessageCount,
  getDb,
  getMessages,
  lockChat,
  searchChunks,
  type StoredMessage,
} from '$lib/server/db';

import { embedText } from '$lib/server/embed';
import { buildRagPrompt, chatStream, chatStreamWithTools } from '$lib/server/llm';
import { checkCache, storeCache } from '$lib/server/llm-cache';
import {
  getMcpToolDefs,
  getMcpResourceContent,
  getMcpPromptContent,
  getSystemPromptAddition,
  type McpToolDef,
} from '$lib/server/mcp/tools';
import type { LLMEvent } from '$lib/server/llm/types';
import { config } from '$lib/server/config';
import { CAT, createLogger } from '$lib/server/logger';
import { classifyQuery } from '$lib/query-classifier';
import type { QueryClass } from '$lib/query-classifier';
import { Effect, Stream } from 'effect';
import type { ChatMessage } from '$lib/server/openai-provider';
import {
  tryRenameChat,
  needsGithubTools,
  needsMaculaTools,
  isRelevant,
  generatePoliteResponse,
  parseToolClass,
  parseSources,
} from '$lib/server/chat-helpers';

/** Shape of a chat-completion API response. */
interface ChatCompletionResponse {
  choices?: { message?: { content?: string; reasoning_content?: string } }[];
}

const log = createLogger(CAT.chat);

/**
 * Streaming text filter that removes <tool_calls>...</tool_calls> XML blocks.
 *
 * State machine handles blocks that span multiple streamed chunks:
 * - Opening tag in chunk N, closing tag in chunk N+M
 * - Both tags in the same chunk
 *
 * Designed as a reusable class — instantiate per LLM stream, call `next(chunk)`
 * for each text-delta to get the filtered text.
 *
 * Uses regex matching to handle prefixed variants like <||DMSL||tool_calls>
 * that some LLMs spontaneously generate as self-obfuscation.
 *
 * Edge case not handled: tag split across token boundaries (e.g. `<tool_` + `calls>`)
 * is extremely rare with LLM tokenizers and would only leak partial text briefly.
 */
class ToolCallXmlStripper {
  #inBlock = false;
  #openRe = /<[^>]*tool_calls[^>]*>/i;
  #closeRe = /<\/[^>]*tool_calls[^>]*>/i;

  /** Process a text chunk and return only text NOT inside <tool_calls> blocks. */
  next(chunk: string): string {
    if (this.#inBlock) return this.#drain(chunk);
    return this.#fill(chunk);
  }

  /** True when currently inside a <tool_calls> block. */
  get isInside(): boolean {
    return this.#inBlock;
  }

  // --- private ---

  #fill(chunk: string): string {
    const match = chunk.match(this.#openRe);
    if (!match) return chunk;

    this.#inBlock = true;
    const before = chunk.slice(0, match.index!);
    const after = chunk.slice(match.index! + match[0].length);

    // Closing tag could be in same chunk
    const closeMatch = after.match(this.#closeRe);
    if (closeMatch) {
      this.#inBlock = false;
      return before + after.slice(closeMatch.index! + closeMatch[0].length);
    }

    return before;
  }

  #drain(chunk: string): string {
    const match = chunk.match(this.#closeRe);
    if (!match) return '';

    this.#inBlock = false;
    return chunk.slice(match.index! + match[0].length);
  }
}

/**
 * LLM-based tool-needs classifier for short ambiguous follow-ups like 'yup do it' or '3 more?'.
 * Keyword-based checks can't determine intent for these, so we ask the LLM what tools are needed.
 *
 * Returns 'none' | 'github' | 'macula' | 'both'. Fail-safe: returns 'none' on any error/timeout
 * so tools are never mis-enabled. Only called in handleEarlyGates when keyword checks are
 * inconclusive AND text is short (≤6 words).
 *
 * DeepSeek-backed models put the answer in reasoning_content rather than content,
 * so we also extract the keyword via regex from verbose responses as a fallback.
 */
async function classifyToolNeeds(
  question: string,
  history: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<'none' | 'github' | 'macula' | 'both'> {
  const context = history
    .slice(-2)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  try {
    const content =
      "Given this conversation, does the user's response require executing tools?\n\n" +
      'GITHUB — searching code, listing issues, pull requests, repos, stars, forks, commits.\n' +
      'MACULA — viewing, searching, listing photos, images, videos, files, media, keywords, licenses.\n' +
      'NONE — simple reply, greeting, thanks, or question needing no tools.\n\n' +
      'Examples:\n' +
      '- User says "show your repos" → github\n' +
      '- User says "find photos of landscape" → macula\n' +
      '- User says "yup do it" after assistant offered to search GitHub → github\n' +
      '- User says "3 more?" after assistant showed photos → macula\n' +
      '- User says "thanks!" → none\n' +
      (context ? `Conversation so far:\n${context}\n\n` : '') +
      `User's latest message: ${question}`;
    log.info`🔍 classifyToolNeeds prompt:\n${content}`;
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
            content: `You are a classifier for a personal AI assistant. Determine if the user's message requires tool execution.

GITHUB (answer: github): User wants to search code, list issues, pull requests, repos, stars, forks, commits — GitHub operations.

MACULA (answer: macula): User wants to view, search, or list photos, images, videos, files, media, keywords, licenses — Macula media/asset operations or view portfolio content.

BOTH (answer: both): The message requires both GitHub and Macula tools.

NONE (answer: none): The message is a simple reply, greeting, or question needing no tools.

Respond with exactly one word: github, macula, both, or none.`,
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
      signal: signal ?? AbortSignal.timeout(5000),
    });
    log.info`🔍 classifyToolNeeds HTTP status: ${response.status}`;
    if (!response.ok) {
      log.warn`Tool-needs check HTTP ${response.status} — returning none (fail-safe)`;
      return 'none';
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const msg = body.choices?.[0]?.message;
    const rawAnswer = (msg?.content || msg?.reasoning_content || '').trim().toLowerCase();
    log.info`🔍 classifyToolNeeds raw response body: ${JSON.stringify(body).slice(0, 500)}`;
    log.info`🔍 classifyToolNeeds answer="${rawAnswer}"`;
    // Direct match — model put the keyword in content
    if (rawAnswer === 'github' || rawAnswer === 'macula' || rawAnswer === 'both' || rawAnswer === 'none')
      return rawAnswer;
    // Fallback: search reasoning content for classification keyword
    // DeepSeek puts reasoning in reasoning_content, answer may be buried mid-text
    if (rawAnswer.length > 10) {
      const reasoningKeywords = rawAnswer.match(/\b(github|macula|both|none)\b/);
      if (reasoningKeywords) {
        log.info`🔍 classifyToolNeeds: extracted "${reasoningKeywords[1]}" from reasoning content`;
        return parseToolClass(reasoningKeywords[1]);
      }
    }
    log.info`🔍 classifyToolNeeds: answer not recognized, returning none`;
    return 'none';
  } catch (err) {
    log.warn`Tool-needs check failed: ${err} — returning none (fail-safe)`;
    return 'none';
  }
}

/**
 * Pre-generation gates that run before the LLM is called:
 *
 * 1. Relevance check (isRelevant) — rejects off-topic questions, locks the chat
 * 2. Polite-only path — skips embedding, RAG, tools for thank-you messages
 * 3. Embed query text into vector
 * 4. Build composite cache key (current + previous user message)
 * 5. Check semantic cache — return cached answer on hit
 *
 * If all gates pass, returns the embedding data, context messages, history,
 * and the classifyResult from tool-needs classification (if it ran).
 * If a gate handles the request completely, returns { handled: true }.
 */
async function handleEarlyGates(
  text: string,
  chatId: string,
  userId: string,
  abortController: AbortController,
  userAgentId: number | undefined,
  startTime: number,
): Promise<
  | { handled: true }
  | {
      handled: false;
      embedding: { data: number[]; dimensions: number };
      cacheEmbeddingData: number[];
      cacheText: string;
      ctxMessages: StoredMessage[];
      history: ChatMessage[];
      classifyResult?: Awaited<ReturnType<typeof classifyToolNeeds>>;
    }
> {
  // should get max messages from config. unification
  const ctxMessages = getMessages(chatId, 50);
  const history = ctxMessages.map((m) => ({ role: m.role, content: m.content }));

  // For short ambiguous messages, call classifyToolNeeds once and share the result
  let classifyResult: Awaited<ReturnType<typeof classifyToolNeeds>> | undefined;

  // 1a. Check relevance — reject off-topic questions early
  // Slash commands bypass the relevance gate (user-initiated actions are always on-topic)
  if (!text.startsWith('/summarize')) {
    // Check keyword-based tool intent first (no LLM call)
    const githubKeyword = await needsGithubTools(text, ctxMessages);
    const maculaKeyword = await needsMaculaTools(text, ctxMessages);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (!githubKeyword && !maculaKeyword && wordCount <= 6 && ctxMessages?.length) {
      classifyResult = await classifyToolNeeds(text, ctxMessages, AbortSignal.timeout(5000));
    }
    const hasToolIntent =
      githubKeyword ||
      maculaKeyword ||
      classifyResult === 'github' ||
      classifyResult === 'macula' ||
      classifyResult === 'both';
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
        return { handled: true };
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
    return { handled: true };
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
    return { handled: true };
  }

  // 2. Build composite cache key
  let cacheText = text;
  let cacheEmbeddingData = embedding.data;
  const userMessages = ctxMessages.filter((m) => m.role === 'user');
  if (userMessages.length > 1 && userMessages[userMessages.length - 2].content !== text) {
    cacheText = `${userMessages[userMessages.length - 2].content} ${text}`;
    try {
      const ce = await embedText(cacheText);
      cacheEmbeddingData = ce.data;
    } catch (error) {
      console.error('Failed to generate composite embedding', error);
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
    const sources = parseSources(cached.sources);
    const elapsed = performance.now() - startTime;
    publishPersistent(chatId, 'done', {
      answer: cached.answer,
      sources,
      messageId: msgId,
      usage: { chunks: 0, totalTime: Math.floor(elapsed), cached: true },
    });

    tryRenameChat(chatId, text);
    return { handled: true };
  }

  return {
    handled: false,
    embedding,
    cacheEmbeddingData,
    cacheText,
    ctxMessages,
    history,
    classifyResult: classifyResult,
  };
}

/**
 * Return type of streamWithRetry — the full streaming result including
 * accumulated text, token usage, model info, and error/partial state.
 */
interface StreamResult {
  answerText: string;
  reasoningText: string;
  currentModelId: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
  responseMs: number;
  maxTokens: number;
  anyStepHadToolCalls: boolean;
  lastError: Error | null;
  partial: boolean;
  msgId: string;
}

/**
 * Stream LLM response with automatic retry (up to 3 attempts).
 *
 * Retry triggers:
 *   - Empty answer (text-delta produced no characters)
 *   - Doom loop (tools were called but no text was produced)
 *
 * On retry, tools are disabled (mcpToolDefs = null) and the system prompt
 * is hardened with a mandatory instruction to produce text without calling tools.
 *
 * Sub-stream processing:
 *   - Converts GitHub PR/issue references (owner/repo#123) to markdown links
 *   - Flattens nested markdown lists
 *   - Safety net: catches raw tool call JSON that slipped through and replaces it
 *     with a fallback message (defense-in-depth for the tool-needs classifier bug)
 *
 * Tool calls are tracked in the tool_calls SQLite table with timestamps and result sizes.
 */
async function streamWithRetry(
  messages: ChatMessage[],
  mcpToolDefs: McpToolDef[] | null,
  chatId: string,
  abortController: AbortController,
  toolServerMap: Map<string, string>,
): Promise<StreamResult> {
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
  let anySuccessfulToolCalls = false;

  // Pre-generate message ID for tool-call FK tracking
  const db = getDb();
  const msgId = crypto.randomUUID();
  const toolCallStmt = db.prepare(
    `INSERT INTO tool_calls (id, message_id, name, server_id, tool_input, started_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  );
  const toolCallFinishStmt = db.prepare(
    `UPDATE tool_calls SET finished_at = datetime('now'), tool_output = ?, result_size = ? WHERE id = ?`,
  );

  // change from 3 to 10 attempts after adding retry-on-doom-loop logic, to give the model more chances to recover with tools disabled
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const xmlStripper = new ToolCallXmlStripper();
      const llmStream = mcpToolDefs
        ? chatStreamWithTools(messages, mcpToolDefs, abortController.signal)
        : chatStream(messages, abortController.signal);

      const streamStartTime = performance.now();

      await Effect.runPromise(
        Stream.runForEach(llmStream, (event: LLMEvent) =>
          Effect.sync(() => {
            switch (event.type) {
              case 'text-delta':
                answerText += event.text;
                {
                  const filtered = xmlStripper.next(event.text);
                  if (filtered) {
                    publishLive(chatId, 'token', { token: filtered });
                  }
                }
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
                publishLive(chatId, 'tool_call_start', {
                  id: event.id,
                  name: event.name,
                  serverId: toolServerMap.get(event.name) ?? 'unknown',
                  startedAt: Date.now(),
                });
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
                publishLive(chatId, 'tool_call_end', { id: event.id, name: event.name });
                try {
                  const resultStr = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
                  const resultSize = resultStr.length;
                  toolCallFinishStmt.run(resultStr, resultSize, event.id);
                  // Track successful (non-error) tool results for doom loop detection
                  if (!resultStr.includes('Tool returned an error')) {
                    anySuccessfulToolCalls = true;
                  }
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
        (match: string, repo: string, issue: string, offset: number) => {
          const after = answerText.slice(offset + match.length, offset + match.length + 2);
          if (after === '](') return match;
          return `[${repo}#${issue}](https://github.com/${repo}/pull/${issue})`;
        },
      );

      // Flatten nested markdown lists — strip indentation before list markers
      answerText = answerText.replace(/^(\s{2,})([-*+]\s)/gm, '$2');
      // Replace ```tool_call fenced blocks with plain code blocks — LLM sometimes outputs fake tool calls as markdown which crashes syntax highlighters
      answerText = answerText.replace(/```tool_call\n/g, '```\n');

      // Safety net: if answer contains raw tool call JSON (tool function name followed by {),
      // replace with a fallback message. This catches cases where the LLM outputs tool calls
      // as text (e.g., when tools weren't properly enabled).
      if (
        /^(?:\s*\n)*(?:get_file|search_files|list_files|search_code|search_issues|search_pull_requests|list_issues|list_pull_requests|get_file_contents|create_or_update_file)\s*\{/i.test(
          answerText.trim(),
        )
      ) {
        log.warn`Raw tool call JSON detected in LLM output — replacing with fallback`;
        answerText = "I'm sorry, I encountered a tool configuration issue. Please try asking your question again.";
      }

      // Safety net: strip XML tool call artifacts (e.g. <tool_calls><invoke name="traverse">...</invoke></tool_calls>)
      const xmlPattern = /<[^>]*tool_calls[^>]*>[\s\S]*?<\/[^>]*tool_calls[^>]*>/i;
      if (xmlPattern.test(answerText)) {
        log.warn`XML tool call pattern detected in LLM output — stripping`;
        answerText = answerText.replace(xmlPattern, '').trim();
      }

      lastError = null;

      // Retry if answer is empty or doom loop detected (tools called but no text produced)
      const isDoomLoop = anySuccessfulToolCalls && answerText.trim().length === 0;
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

  return {
    answerText,
    reasoningText,
    currentModelId,
    tokenUsage,
    responseMs,
    maxTokens,
    anyStepHadToolCalls,
    lastError,
    partial,
    msgId,
  };
}

/**
 * Parameters for saveAndEmitResult — everything needed to persist the answer
 * and emit the final SSE 'done' or 'error' event to the client.
 */
interface SaveResultParams {
  userId: string;
  chatId: string;
  userAgentId: number | undefined;
  answerText: string;
  reasoningText: string;
  sources: { title: string; score: number; slug: string; url: string }[];
  currentModelId: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
  responseMs: number;
  maxTokens: number;
  partial: boolean;
  lastError: Error | null;
  msgId: string;
  cacheEmbeddingData: number[];
  cacheText: string;
  ragChunks: { title: string; text: string; score: number }[];
  startTime: number;
}

/**
 * Persist the assistant's answer to the messages table and emit the final
 * SSE event ('done' or 'error') to the client.
 *
 * On lastError (retries exhausted): saves the partial answer (if any)
 * or a generic failure message, then emits an 'error' event.
 *
 * On success: saves the full answer, stores in semantic cache, emits 'done'
 * with sources and usage metadata.
 */
async function saveAndEmitResult(params: SaveResultParams): Promise<void> {
  const {
    userId,
    chatId,
    userAgentId,
    answerText,
    reasoningText,
    sources,
    currentModelId,
    tokenUsage,
    responseMs,
    maxTokens,
    partial,
    lastError,
    msgId,
    cacheEmbeddingData,
    cacheText,
    ragChunks,
    startTime,
  } = params;

  if (lastError && !partial) {
    const fallbackText = answerText.trim()
      ? answerText
      : "I'm sorry, I wasn't able to generate a response. Please try rephrasing your question.";
    try {
      addMessage(
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
}

/**
 * Background orchestrator for the full generation pipeline.
 * Called from POST handler without await — runs asynchronously.
 *
 * Pipeline:
 *   1. handleEarlyGates — relevance, polite, embedding, cache
 *   2. classifyQuery — determines if query is rag, tool, or both
 *   3. RAG search (vector similarity on chunk embeddings)
 *   4. (/summarize override — collect sources from conversation history instead)
 *   5. Build RAG prompt with context
 *   6. Conditionally load MCP tools (GitHub/Macula) based on classifyResult + keyword checks
 *   7. Stream from LLM with retry (streamWithRetry)
 *   8. saveAndEmitResult — persist answer, emit SSE done event
 *
 * A 120-second timeout aborts the entire pipeline. The timeout is cleared in finally.
 */
export async function startGeneration(
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

    // 1a-3: Early gates — relevance, polite, embedding, cache
    const earlyResult = await handleEarlyGates(text, chatId, userId, abortController, userAgentId, startTime);
    if (earlyResult.handled) return;
    const { embedding, cacheEmbeddingData, cacheText, ctxMessages, history, classifyResult } = earlyResult;

    // 4. Classify query — skip RAG for tool-only, skip tools for rag
    const queryType: QueryClass = classifyQuery(embedding.data);
    log.info`🎯 queryType=${queryType} "${text.slice(0, 80)}"`;

    // 5. RAG search (skip for tool-only queries)
    let ragChunks: { title: string; text: string; score: number }[] = [];
    let sources: { title: string; score: number; slug: string; url: string }[] = [];

    if (queryType !== 'tool') {
      publishLive(chatId, 'status', { step: 'searching' });
      const results = searchChunks(embedding.data, maxChunks);
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
          url: r.chunk.type === 'post'
            ? `/posts/${r.chunk.slug}`
            : r.chunk.type === 'about'
              ? `/about`
              : `/experience/${r.chunk.slug}`,
          type: r.chunk.type,
        }));
    }

    // Auto-rename "New Chat" to user's first message (all paths)
    tryRenameChat(chatId, text);

    // For /summarize, use all unique sources from conversation history instead of RAG results.
    // RAG search on "/summarize" returns chunks unrelated to the conversation topics.
    if (text.startsWith('/summarize')) {
      ragChunks = [];
      const seen = new Set<string>();
      sources = ctxMessages
        .filter((m) => m.role === 'assistant' && m.sources)
        .flatMap((m) => parseSources(m.sources))
        .filter((s) => {
          if (!s.slug) return false;
          if (seen.has(s.slug)) return false;
          seen.add(s.slug);
          return true;
        })
        .map((s) => ({
          title: s.title,
          score: s.score,
          slug: s.slug ?? '',
          url: s.url ?? '',
        }));

      // Replace user message with a summarization prompt
      text =
        'Provide a concise summary of the above conversation covering the key topics, projects, and experience discussed.';
    }

    // 6. Build RAG prompt
    const messages = buildRagPrompt(text, ragChunks, history);

    // 6b. Conditionally load MCP tools — detect which tool categories are needed
    let mcpToolDefs: McpToolDef[] | null = null;
    const githubNeeded =
      classifyResult === 'github' || classifyResult === 'both' || (await needsGithubTools(text, ctxMessages));
    const maculaNeeded =
      classifyResult === 'macula' || classifyResult === 'both' || (await needsMaculaTools(text, ctxMessages));

    // Fetch MCP resource content for system prompt (macula only)
    let resourceContent = '';
    if (maculaNeeded) {
      try {
        resourceContent = await getMcpResourceContent('macula');
      } catch (err) {
        log.error`Failed to fetch MCP resources: ${err}`;
      }
    }

    // Fetch MCP prompt content for system prompt (macula only)
    let promptContent = '';
    if (maculaNeeded) {
      try {
        promptContent = await getMcpPromptContent();
      } catch (err) {
        log.error`Failed to fetch MCP prompts: ${err}`;
      }
    }

    if (githubNeeded || maculaNeeded) {
      try {
        const toolDefs = await getMcpToolDefs();
        if (toolDefs.length > 0) {
          mcpToolDefs = toolDefs;
          log.info`🔧 tools: ${toolDefs.map((t: McpToolDef) => t.name).join(', ')}`;
          // Inject tool awareness into system prompt (always first message)
          if (messages.length > 0 && messages[0].role === 'system') {
            let additions = getSystemPromptAddition({ github: githubNeeded, macula: maculaNeeded });
            if (resourceContent) additions += '\n\n' + resourceContent;
            if (promptContent) additions += '\n\n' + promptContent;
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

    // 7. Stream from OpenRouter with retry
    const streamResult = await streamWithRetry(messages, mcpToolDefs, chatId, abortController, toolServerMap);
    const {
      answerText,
      reasoningText,
      currentModelId,
      tokenUsage,
      responseMs,
      maxTokens,
      anyStepHadToolCalls,
      lastError,
      partial,
      msgId,
    } = streamResult;

    // If tools were called, clear sources (RAG sources don't apply to tool results)
    if (anyStepHadToolCalls) {
      sources = [];
    }

    // 8. Save result, store cache, emit done
    await saveAndEmitResult({
      userId,
      chatId,
      userAgentId,
      answerText,
      reasoningText,
      sources,
      currentModelId,
      tokenUsage,
      responseMs,
      maxTokens,
      partial,
      lastError,
      msgId,
      cacheEmbeddingData,
      cacheText,
      ragChunks,
      startTime,
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
