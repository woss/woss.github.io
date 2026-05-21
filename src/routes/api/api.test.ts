// ============================================================
// API Integration Tests — /api/search (GET) & /api/ask (POST)
// ============================================================

import type { RequestEvent } from '@sveltejs/kit';
import { mock, describe, it, expect, beforeEach } from 'bun:test';

// ---- Mock setup ----

const mockSearchChunks = mock<(...args: unknown[]) => unknown>(() => []);
const mockEmbedText = mock<(...args: unknown[]) => unknown>(() => ({
  data: new Array(1024).fill(0),
  dimensions: 1024,
}));

const mockIsAvailable = mock<() => Promise<boolean>>(() => Promise.resolve(true));
const mockCheckRateLimit = mock<(...args: unknown[]) => unknown>(() => ({
  allowed: true,
  remaining: 9,
  resetAt: Date.now() + 60_000,
}));
mock.module('$lib/server/db', () => ({
  searchChunks: mockSearchChunks,
  addMessage: mock(() => {}),
  getMessages: mock(() => []),
}));

mock.module('$lib/server/embed', () => ({
  embedText: mockEmbedText,
  EMBEDDING_DIM: 1024,
}));

mock.module('$lib/server/llm', () => ({
  chatStreamWithTools: mock(() => {}),
  isAvailable: mockIsAvailable,
}));

// Config values are provided by preload (src/test/setup.ts), loaded before test files.

mock.module('$lib/server/llm-cache', () => ({
  checkCache: mock(() => null),
  storeCache: mock(() => {}),
}));

mock.module('$lib/server/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// ---- Imports (after mocks are set up) ----

import { GET } from './search/+server';

// ---- Helpers ----

function createMockEvent(
  options: {
    method?: string;
    url?: string;
    body?: unknown;
    clientIp?: string;
  } = {},
): RequestEvent {
  const { method = 'GET', url = 'http://localhost:5173/api/search?q=test', body, clientIp = '127.0.0.1' } = options;

  const init: RequestInit & { headers: Record<string, string> } = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  const request = new Request(url, init);

  return {
    request,
    url: new URL(url),
    params: {},
    route: { id: '/api/search' },
    getClientAddress: () => clientIp,
    locals: {},
    platform: {},
    fetch: globalThis.fetch,
    cookies: {
      get: mock(() => {}),
      getAll: mock(() => []),
      set: mock(() => {}),
      delete: mock(() => {}),
      serialize: mock(() => ''),
    },
    isDataRequest: false,
    isSubRequest: false,
  } as unknown as RequestEvent;
}

// ============================================================
//  /api/search (GET)
// ============================================================

describe('/api/search (GET)', () => {
  beforeEach(() => {
    mockSearchChunks.mockReset();
    mockSearchChunks.mockReturnValue([]);
    mockEmbedText.mockReset();
    mockEmbedText.mockReturnValue({ data: new Array(1024).fill(0), dimensions: 1024 });
    mockIsAvailable.mockReset();
    mockIsAvailable.mockResolvedValue(true);
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
  });

  it('returns 400 when q param is missing', async () => {
    const event = createMockEvent({ url: 'http://localhost:5173/api/search' });
    const response = await GET(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('required');
  });

  it('returns 400 when q is empty', async () => {
    const event = createMockEvent({
      url: 'http://localhost:5173/api/search?q=',
    });
    const response = await GET(event);
    expect(response.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const event = createMockEvent({
      url: 'http://localhost:5173/api/search?q=rust',
    });
    const response = await GET(event);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns 503 when Ollama unavailable', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);

    const event = createMockEvent({
      url: 'http://localhost:5173/api/search?q=rust',
    });
    const response = await GET(event);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain('unavailable');
  });

  it('sanitizes HTML in query', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockEmbedText.mockReturnValueOnce({ data: new Array(1024).fill(0), dimensions: 1024 });
    mockSearchChunks.mockReturnValueOnce([]);

    const event = createMockEvent({
      url: 'http://localhost:5173/api/search?q=<script>alert(1)</script>rust',
    });
    const response = await GET(event);
    expect(response.status).toBe(200);

    // embedText should be called with sanitized text (tags stripped)
    expect(mockEmbedText).toHaveBeenCalledWith('alert(1)rust');
  });

  it('returns results on successful search', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockEmbedText.mockReturnValueOnce({ data: new Array(1024).fill(0.1), dimensions: 1024 });
    mockSearchChunks.mockReturnValueOnce([
      {
        chunk: {
          id: 'abc',
          text: 'Rust is a systems language',
          title: 'Rust Post',
          date: '2024-01-01',
          tags: ['rust'],
          section: 'Intro',
          embedding: [],
          type: 'post',
        },
        score: 0.15,
      },
    ]);

    const event = createMockEvent({
      url: 'http://localhost:5173/api/search?q=rust',
    });
    const response = await GET(event);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].chunk.text).toBe('Rust is a systems language');
    // embedding vector should be excluded from response
    expect(body.results[0].chunk.embedding).toBeUndefined();
  });

  it('returns empty results when no relevant chunks found (all above threshold)', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockEmbedText.mockReturnValueOnce({ data: new Array(1024).fill(0.1), dimensions: 1024 });
    mockSearchChunks.mockReturnValueOnce([
      {
        chunk: {
          id: 'abc',
          text: 'Unrelated content',
          title: 'Other',
          date: null,
          tags: [],
          section: '',
          embedding: [],
          type: 'post',
        },
        score: 1.8, // Above 1.5 threshold → filtered out
      },
    ]);

    const event = createMockEvent({
      url: 'http://localhost:5173/api/search?q=rust',
    });
    const response = await GET(event);
    const body = await response.json();
    expect(body.results).toHaveLength(0);
  });
});



// ============================================================
//  /api/chat/history (GET)
// ============================================================

describe('/api/chat/history (GET)', () => {
  it('returns 400 when userId is missing', async () => {
    const event = createMockEvent({
      url: 'http://localhost:5173/api/chat/history',
    });
    const { GET } = await import('./chat/history/+server');
    const response = await GET(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('required');
  });

  it('returns messages for valid userId', async () => {
    // getMessages is already mocked to return []
    const event = createMockEvent({
      url: 'http://localhost:5173/api/chat/history?userId=test-uuid',
    });
    const { GET } = await import('./chat/history/+server');
    const response = await GET(event);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages).toEqual([]);
  });
});

// ============================================================
//  /api/chat/history (DELETE)
// ============================================================

describe('/api/chat/history (DELETE)', () => {
  it('returns 400 when userId is missing', async () => {
    const event = createMockEvent({
      method: 'DELETE',
      url: 'http://localhost:5173/api/chat/history',
    });
    const { DELETE: del } = await import('./chat/history/+server');
    const response = await del(event);
    expect(response.status).toBe(400);
  });

  it('returns success for valid userId', async () => {
    const event = createMockEvent({
      method: 'DELETE',
      url: 'http://localhost:5173/api/chat/history?userId=test-uuid',
    });
    const { DELETE: del } = await import('./chat/history/+server');
    const response = await del(event);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
