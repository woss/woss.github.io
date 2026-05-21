import type { RequestEvent } from '@sveltejs/kit';
import { getToolCallsByMessageId } from '$lib/server/db';

// GET /api/chat/[id]/messages/[msgId]/tool-calls — get tool calls for a message
export async function GET(event: RequestEvent): Promise<Response> {
  const msgId = event.params.msgId;

  if (!msgId) {
    return new Response(JSON.stringify({ error: 'messageId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const toolCalls = getToolCallsByMessageId(msgId);
    return new Response(JSON.stringify({ toolCalls }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
