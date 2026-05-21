/**
 * LLM provider adapter.
 * Re-exports from the unified OpenAI-compatible provider.
 */
import {
  chatStream as cs,
  chatStreamWithTools as cswt,
  isAvailable as ia,
  buildRagPrompt as brp,
} from './openai-provider';

export const chatStream = cs;
export const chatStreamWithTools = cswt;
export const isAvailable = ia;
export const buildRagPrompt = brp;
