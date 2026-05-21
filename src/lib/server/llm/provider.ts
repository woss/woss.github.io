import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { config } from '$lib/server/config';

/**
 * OpenAI-compatible provider for chat completions.
 * Uses @ai-sdk/openai-compatible for generic API support.
 * Works with any /v1/chat/completions endpoint.
 */
export const provider = createOpenAICompatible({
  name: 'provider',
  baseURL: config().openai.baseUrl,
  apiKey: config().openai.apiKey,
});

export const modelName = config().openai.model;
