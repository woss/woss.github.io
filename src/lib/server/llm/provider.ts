import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { config } from '$lib/server/config';

/**
 * Creates a TransformStream that rewrites finish_reason in SSE responses.
 * DeepSeek / Cloudflare Workers AI emit `finish_reason: "stop"` instead of
 * `"tool_calls"` when tool calls were made in the response. This causes the
 * AI SDK's maxSteps loop to stop prematurely, preventing the model from
 * writing an answer after calling a tool.
 *
 * The transform tracks whether any `tool_calls` deltas appeared in the SSE
 * stream. When `finish_reason: "stop"` is encountered and tool calls were
 * seen, it rewrites the finish_reason to `"tool_calls"` so the SDK correctly
 * continues to the next step.
 */
function fixFinishReasonTransform(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let sawToolCalls = false;

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = buffer.endsWith('\n') ? '' : (lines.pop() ?? '');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            const choice = parsed.choices?.[0];
            if (choice) {
              if (choice.delta?.tool_calls) {
                sawToolCalls = true;
              }
              if (choice.finish_reason === 'stop' && sawToolCalls) {
                choice.finish_reason = 'tool_calls';
                sawToolCalls = false;
                controller.enqueue(encoder.encode('data: ' + JSON.stringify(parsed) + '\n'));
                continue;
              }
            }
          } catch {
            // passthrough malformed JSON
          }
        }
        controller.enqueue(encoder.encode(line + '\n'));
      }
    },
    flush(controller) {
      if (buffer) {
        controller.enqueue(encoder.encode(buffer + '\n'));
      }
    },
  });
}

/**
 * Custom fetch function that pipes SSE responses through the finish_reason
 * fix transform before returning them to the SDK.
 */
async function customFetch(input: string | URL | globalThis.Request, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (!response.body) return response;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) return response;

  const transformedStream = response.body.pipeThrough(fixFinishReasonTransform());

  return new Response(transformedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const provider = createOpenAICompatible({
  name: 'provider',
  baseURL: config().openai.baseUrl,
  apiKey: config().openai.apiKey,
  fetch: customFetch,
});

export const modelName = config().openai.model;
