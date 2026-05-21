/**
 * Unified OpenAI-compatible LLM provider.
 * Uses Vercel AI SDK streamText + Effect.ts Stream for typed event streaming.
 */
import { config } from '$lib/server/config';
import { CAT, createLogger } from './logger';
import { jsonSchema, streamText } from 'ai';
import { Effect, Stream } from 'effect';
import type { Stream as StreamType } from 'effect/Stream';
import { provider, modelName } from './llm/provider';
import type { LLMEvent } from './llm/types';
import type { LanguageModel, ModelMessage, StreamTextOnErrorCallback, ToolSet } from 'ai';
import type { McpToolCallResult } from './mcp/client';

interface StreamTextOptions {
  model: LanguageModel;
  messages: Array<ModelMessage>;
  system?: string;
  allowSystemInMessages?: boolean;
  abortSignal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  maxSteps?: number;
  tools?: ToolSet;
  onChunk?: (event: { chunk: Record<string, unknown> }) => void;
  onError?: StreamTextOnErrorCallback;
  onFinish?: (event: Record<string, unknown>) => void;
}

const log = createLogger(CAT.llm);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RagChunk {
  title: string;
  text: string;
  score: number;
}

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const BASE_URL = config().openai.baseUrl;
const MODEL = config().openai.model;
const MAX_TOKENS = config().openai.maxTokens;

log.debug`[openai-provider] BASE_URL: ${BASE_URL} | MODEL: ${MODEL}`;
/* ------------------------------------------------------------------ */
/*  Model Instance                                                     */
/* ------------------------------------------------------------------ */

const model = provider(modelName);

/* ------------------------------------------------------------------ */
/*  Sanitization                                                       */
/* ------------------------------------------------------------------ */

function sanitizeText(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

/* ------------------------------------------------------------------ */
/*  RAG Prompt Builder                                                 */
/* ------------------------------------------------------------------ */

function buildRagPrompt(question: string, chunks: RagChunk[], history?: ChatMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  let systemPrompt = config().prompts.system;

  if (chunks.length > 0) {
    const context = chunks
      .map((c, i) => `[${i + 1}] From "${c.title}" (relevance: ${c.score.toFixed(2)}):\n${c.text}`)
      .join('\n\n');
    systemPrompt += `\n\nContext:\n${context}`;
  }

  messages.push({ role: 'system', content: systemPrompt });

  if (history && history.length > 0) {
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  messages.push({ role: 'user', content: question });

  return messages;
}

/* ------------------------------------------------------------------ */
/*  MCP Tool -> AI SDK ToolSet Converter                              */
/* ------------------------------------------------------------------ */

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Convert MCP tool definitions to AI SDK ToolSet format.
 * Each tool gets an execute function that delegates to the MCP runtime.
 */
function buildToolSet(
  tools: McpToolDef[],
  executeFn: (tc: { name: string; arguments?: string }) => Promise<McpToolCallResult>,
): ToolSet {
  const toolSet: ToolSet = {};
  for (const tool of tools) {
    toolSet[tool.name] = {
      description: tool.description,
      inputSchema: jsonSchema(tool.inputSchema ?? { type: 'object', properties: {} }),
      execute: async (args: Record<string, unknown>) => {
        const argsStr = args
          ? Object.entries(args)
              .map(([k, v]) => `${k}=${v}`)
              .join(' ')
          : '';
        log.info`⚙ ${tool.name} [${argsStr}]`;
        const result = await executeFn({
          name: tool.name,
          arguments: JSON.stringify(args),
        });
        const toolResult = result.content.map((item) => item.text ?? '').join('');
        log.debug`[buildToolSet] ${tool.name} execute result length=${toolResult.length}, first 200 chars="${toolResult.slice(0, 200)}"`;
        const maxResultLength = config().openai.maxResultsLength;
        const truncated =
          toolResult.length > maxResultLength
            ? toolResult.slice(0, maxResultLength) + '\n\n[... truncated: full output too large]'
            : toolResult;
        return truncated;
      },
    };
  }
  return toolSet;
}

/* ------------------------------------------------------------------ */
/*  Streaming Chat                                                     */
/* ------------------------------------------------------------------ */

/**
 * Stream chat tokens from the LLM via Vercel AI SDK streamText.
 * Returns a Stream of typed LLMEvents.
 */
function chatStream(messages: ChatMessage[], signal?: AbortSignal): StreamType<LLMEvent, Error> {
  const tools: never[] = [];
  return chatStreamWithTools(messages, tools, signal);
}

/**
 * Stream chat with MCP tool definitions via streamText.
 * Uses maxSteps for automatic multi-round tool execution.
 * Returns a Stream of typed LLMEvents.
 */
function chatStreamWithTools(
  messages: ChatMessage[],
  mcpToolDefs: McpToolDef[],
  signal?: AbortSignal,
): StreamType<LLMEvent, Error> {
  return Stream.asyncPush<LLMEvent, Error>(
    (emit) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          log.debug`chatStreamWithTools starting, messages: ${messages.length}, tools: ${mcpToolDefs?.length ?? 0}`;

          let aborted = false;
          const hasTools = mcpToolDefs && mcpToolDefs.length > 0;

          const toolSet = hasTools
            ? buildToolSet(mcpToolDefs, async (tc) => {
                const { executeMcpToolCall } = await import('./mcp/tools');
                return executeMcpToolCall(tc);
              })
            : undefined;

          const currentMessages = messages.map((m) => ({
            role: m.role,
            content: String(m.content ?? ''),
          })) as Array<ModelMessage>;

          // Aggregated across all rounds
          let aggregatedUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
          let lastFinishReason: string = 'stop';
          let actualModelName: string = config().openai.model;

          const MAX_ROUNDS = 3;

          async function runRound(round: number): Promise<void> {
            if (aborted) return;

            let roundToolCalls = 0;
            let roundTextLength = 0;
            const roundToolResults: string[] = [];

            const streamOptions: StreamTextOptions = {
              model,
              allowSystemInMessages: true,
              messages: currentMessages,
              abortSignal: signal,
              temperature: 0.2,
              ...(MAX_TOKENS !== undefined ? { maxTokens: MAX_TOKENS } : {}),
              ...(toolSet ? { tools: toolSet, maxSteps: 1 } : {}),
              onChunk: ({ chunk }) => {
                if (aborted) return;
                switch (chunk.type) {
                  case 'text-delta':
                    roundTextLength += (chunk.text as string).length;
                    emit.single({ type: 'text-delta', text: chunk.text } as LLMEvent);
                    break;
                  case 'reasoning-delta':
                    emit.single({ type: 'reasoning-delta', text: chunk.text } as LLMEvent);
                    break;
                  case 'tool-call':
                    roundToolCalls++;
                    emit.single({
                      type: 'tool-call',
                      id: chunk.toolCallId,
                      name: chunk.toolName,
                      input: chunk.args,
                    } as LLMEvent);
                    break;
                  case 'tool-result':
                    log.debug`[onChunk-tool-result] name=${chunk.toolName}, resultType=${typeof chunk.output}, resultLength=${typeof chunk.output === 'string' ? chunk.output.length : JSON.stringify(chunk.output).length}, full=${typeof chunk.output === 'string' ? chunk.output : JSON.stringify(chunk.output)}`;
                    emit.single({
                      type: 'tool-result',
                      id: chunk.toolCallId,
                      name: chunk.toolName,
                      result: chunk.output,
                    } as LLMEvent);
                    // Collect tool result text for re-round context
                    if (typeof chunk.output === 'string') {
                      roundToolResults.push(chunk.output);
                    } else if (chunk.output && typeof chunk.output === 'object') {
                      try {
                        const text = JSON.stringify(chunk.output).slice(0, 2000);
                        roundToolResults.push(text);
                      } catch {
                        /* ignore */
                      }
                    }
                    break;
                  case 'tool-input-delta':
                    emit.single({
                      type: 'tool-input-delta',
                      id: chunk.id,
                      name: chunk.toolName as string,
                      text: chunk.delta as string,
                    } as LLMEvent);
                    break;
                  case 'error':
                    log.error`[streamText] chunk error: ${chunk.error}`;
                    if (!aborted) {
                      emit.fail(chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error)));
                    }
                    break;
                }
              },
              onError: ({ error }: { error: unknown }) => {
                log.error`[first-round-error] ${error instanceof Error ? error.message : String(error)} stack=${error instanceof Error ? error.stack : 'N/A'}`;
              },
              onFinish: (event: Record<string, unknown>) => {
                lastFinishReason = event.finishReason as string;
                const finishResponse = event.response as Record<string, unknown> | undefined;
                if (finishResponse?.modelId) {
                  actualModelName = finishResponse.modelId as string;
                }
                const finishUsage = event.usage as Record<string, unknown> | undefined;
                if (finishUsage) {
                  aggregatedUsage = {
                    inputTokens: (aggregatedUsage?.inputTokens ?? 0) + ((finishUsage.promptTokens as number) ?? 0),
                    outputTokens: (aggregatedUsage?.outputTokens ?? 0) + ((finishUsage.completionTokens as number) ?? 0),
                    totalTokens: (aggregatedUsage?.totalTokens ?? 0) + ((finishUsage.totalTokens as number) ?? 0),
                  };
                }
              },
            };

            return new Promise<void>((resolve, reject) => {
              try {
                const result = streamText(streamOptions);
                Promise.resolve(result.text)
                  .then(() => {
                    try {
                      if (aborted) return resolve();

                      emit.single({
                        type: 'step-finish',
                        reason: mapFinishReason(lastFinishReason),
                        toolCalls: roundToolCalls,
                        textProduced: roundTextLength > 0,
                        usage: aggregatedUsage,
                      } as unknown as LLMEvent);

                      if (roundToolCalls > 0 && round < MAX_ROUNDS) {
                        log.info`[synthesis-round] ${roundToolCalls} tool calls, ${roundTextLength} text chars — running synthesis round with results`;

                        // Append tool results so the model has the data in context
                        if (roundToolResults.length > 0) {
                          const resultsText = roundToolResults
                            .map((r, i) => `[Tool result ${i + 1}]: ${r}`)
                            .join('\n\n');
                          currentMessages.push({
                            role: 'user',
                            content: `The tool returned the following data:\n\n${resultsText}\n\nNow provide a clear, complete answer based on this data. Include specific details from the results. Do NOT call any more tools.`,
                          });
                        } else {
                          currentMessages.push({
                            role: 'user',
                            content:
                              'You just called tools. Now produce a clear answer based on the tool results you received. Do NOT call tools — just write the answer.',
                          });
                        }

                        // Run synthesis round WITHOUT tools
                        roundToolCalls = 0;
                        roundTextLength = 0;

                        try {
                          const forcedResult = streamText({
                            model: provider(modelName),
                            messages: currentMessages,
                            abortSignal: signal,
                            temperature: 0.2,
                            ...(MAX_TOKENS !== undefined ? { maxOutputTokens: MAX_TOKENS } : {}),
                            allowSystemInMessages: true,
                            onChunk: ({ chunk }: { chunk: Record<string, unknown> }) => {
                              if (aborted) return;
                              if (chunk.type === 'text-delta') {
                                roundTextLength += (chunk.text as string).length;
                                emit.single({ type: 'text-delta', text: chunk.text } as LLMEvent);
                              } else if (chunk.type === 'reasoning-delta') {
                                emit.single({ type: 'reasoning-delta', text: chunk.text } as LLMEvent);
                              }
                            },
                            onError: ({ error: err }: { error: unknown }) => {
                              log.error`[synthesis-stream-error] ${err instanceof Error ? err.message : String(err)}`;
                              if (!aborted) {
                                emit.fail(err instanceof Error ? err : new Error(String(err)));
                              }
                            },
                            onFinish: () => {},
                          });

                          Promise.resolve(forcedResult.text)
                            .then(() => {
                              try {
                                // Emit real step-finish reflecting synthesis outcome
                                emit.single({
                                  type: 'step-finish',
                                  reason: 'stop',
                                  toolCalls: 0,
                                  textProduced: roundTextLength > 0,
                                } as unknown as LLMEvent);
                                resolve();
                              } catch (e: unknown) {
                                reject(e);
                              }
                            })
                            .catch((err: unknown) => {
                              if (aborted) return resolve();
                              const errWithCode = err as { code?: string; message?: string; stack?: string; name?: string };
                              const errorMsg = errWithCode.message || String(err);
                              const errorStack = errWithCode.stack || new Error().stack;
                              const errorName = errWithCode.name || typeof err;
                              const errorCode = errWithCode.code || 'N/A';
                              log.error`[synthesis-crash] errorName=${errorName} message=${errorMsg} code=${errorCode}`;
                              log.error`[synthesis-crash-stack] ${errorStack}`;
                              reject(err);
                            });
                        } catch (err: unknown) {
                          reject(err);
                        }
                      } else {
                        resolve();
                      }
                    } catch (e: unknown) {
                      reject(e);
                    }
                  })
                  .catch((err: unknown) => {
                    if (aborted) return resolve();
                    reject(err);
                  });
              } catch (e: unknown) {
                reject(e);
              }
            });
          }

          runRound(1)
            .then(() => {
              if (aborted) return;
              aborted = true;

              emit.single({
                type: 'finish' as const,
                reason: mapFinishReason(lastFinishReason),
                usage: aggregatedUsage,
                modelName: config().openai.model,
                actualModelName,
                provider: BASE_URL,
                maxTokens: MAX_TOKENS,
              } as LLMEvent);
              emit.end();
            })
            .catch((err: unknown) => {
              if (aborted) return;
              aborted = true;
              if ((err instanceof DOMException || err instanceof Error) && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
                emit.end();
              } else {
                emit.fail(err instanceof Error ? err : new Error(String(err)));
              }
            });

          return Effect.sync(() => {
            aborted = true;
          });
        }),
        (cleanup: Effect.Effect<void>) => cleanup,
      ),
    { bufferSize: 'unbounded' },
  );
}

/* ------------------------------------------------------------------ */
/*  Finish Reason Mapping                                              */
/* ------------------------------------------------------------------ */

function mapFinishReason(reason: string): 'stop' | 'tool-calls' | 'error' | 'length' | 'unknown' {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'tool-calls':
      return 'tool-calls';
    case 'error':
      return 'error';
    case 'length':
      return 'length';
    default:
      return 'unknown';
  }
}

/* ------------------------------------------------------------------ */
/*  Health Check                                                       */
/* ------------------------------------------------------------------ */

async function isAvailable(): Promise<boolean> {
  if (!config().openai.apiKey) {
    log.debug`[isAvailable] false: no API_KEY`;
    return false;
  }
  try {
    const url = `${BASE_URL}/models`;
    log.debug`[isAvailable] fetching: ${url}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${config().openai.apiKey}` },
    });
    log.debug`[isAvailable] status: ${res.status} ok: ${res.ok}`;
    return res.ok;
  } catch (err) {
    log.error`[isAvailable] catch: ${err}`;
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

export { buildRagPrompt, chatStream, chatStreamWithTools, isAvailable, sanitizeText };
export type { ChatMessage, ChatRole, RagChunk };
