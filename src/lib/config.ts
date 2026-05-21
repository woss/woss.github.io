/**
 * Client-safe config (public env vars only).
 * Available from both client and server code.
 */
import { PUBLIC_MAX_MESSAGES, PUBLIC_MAX_CHATS } from '$env/static/public';

export const config = {
  get public() {
    return {
      maxMessages: Number(PUBLIC_MAX_MESSAGES) || 10,
      maxChats: Number(PUBLIC_MAX_CHATS) || 3,
    };
  },
} as const;
