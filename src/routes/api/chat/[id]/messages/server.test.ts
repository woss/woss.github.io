import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/server/db', () => ({
  getMessages: vi.fn(),
  getToolCallsForMessages: vi.fn(),
}));

vi.mock('$lib/server/logger', () => ({
  CAT: { chat: 'chat' },
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  })),
}));

import { getMessages, getToolCallsForMessages } from '$lib/server/db';
import { GET } from './+server';

function buildEvent(chatId: string | null): RequestEvent {
  return {
    params: chatId ? { id: chatId } : {},
    request: {} as Request,
    url: new URL(`http://localhost/api/chat/${chatId ?? ''}/messages`),
    getClientAddress: () => '127.0.0.1',
    cookies: {} as any,
    locals: {},
    setHeaders: () => {},
    isDataRequest: false,
    isSubRequest: false,
    route: { id: 'api/chat/[id]/messages' },
  } as RequestEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/chat/[id]/messages', () => {
  it('returns 400 when chatId is missing from params', async () => {
    const event = buildEvent(null);
    const res = await GET(event);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('chatId required');
  });

  it('returns 200 with messages including toolCalls on success', async () => {
    const mockMessages = [
      { id: 'msg-1', role: 'user', content: 'Hello' },
      { id: 'msg-2', role: 'assistant', content: 'Hi there' },
    ];
    const mockToolCalls = {
      'msg-2': [
        { id: 'tc-1', name: 'search', server_id: 'server-1', started_at: '2024-01-01', finished_at: '2024-01-01' },
      ],
    };

    vi.mocked(getMessages).mockReturnValue(mockMessages as any);
    vi.mocked(getToolCallsForMessages).mockReturnValue(mockToolCalls);

    const event = buildEvent('chat-1');
    const res = await GET(event);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toEqual([
      { ...mockMessages[0], toolCalls: [] },
      { ...mockMessages[1], toolCalls: mockToolCalls['msg-2'] },
    ]);
    expect(getMessages).toHaveBeenCalledWith('chat-1', 50, 0);
    expect(getToolCallsForMessages).toHaveBeenCalledWith(['msg-1', 'msg-2']);
  });

  it('returns 200 with empty toolCalls when getToolCallsForMessages returns empty', async () => {
    const mockMessages = [
      { id: 'msg-1', role: 'user', content: 'Hello' },
    ];
    vi.mocked(getMessages).mockReturnValue(mockMessages as any);
    vi.mocked(getToolCallsForMessages).mockReturnValue({});

    const event = buildEvent('chat-1');
    const res = await GET(event);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toEqual([
      { ...mockMessages[0], toolCalls: [] },
    ]);
  });

  it('returns 500 when getMessages throws', async () => {
    vi.mocked(getMessages).mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const event = buildEvent('chat-1');
    const res = await GET(event);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });

  it('returns 500 when getToolCallsForMessages throws', async () => {
    vi.mocked(getMessages).mockReturnValue([{ id: 'msg-1' }] as any);
    vi.mocked(getToolCallsForMessages).mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const event = buildEvent('chat-1');
    const res = await GET(event);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });
});
