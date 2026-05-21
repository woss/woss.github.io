// ============================================================
// OpenAI Provider Unit Tests
// ============================================================

import { mock, describe, it, expect } from 'bun:test';

// Config values are provided by preload (src/test/setup.ts), loaded before test files.
// If env var overrides are needed mid-test, set process.env before the first config() call.

import { buildRagPrompt, chatStream, chatStreamWithTools, isAvailable, sanitizeText } from './openai-provider';

// ============================================================
//  sanitizeText
// ============================================================

describe('sanitizeText', () => {
  it('strips <script> tags and their content', () => {
    // Space before <script> is preserved — only the tag block is removed
    expect(sanitizeText('hello <script>alert(1)</script>world')).toBe('hello world');
  });

  it('strips HTML tags', () => {
    expect(sanitizeText('<div>hello</div> <p>world</p>')).toBe('hello world');
  });

  it('strips on* event handlers with double quotes', () => {
    expect(sanitizeText('click <button onclick="alert(1)">here</button>')).toBe('click here');
  });

  it('strips on* event handlers with single quotes', () => {
    expect(sanitizeText("click <div onclick='steal()'>here</div>")).toBe('click here');
  });

  it('strips javascript: URIs', () => {
    expect(sanitizeText('<a href="javascript:void(0)">link</a>')).toBe('link');
  });

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('passes through safe text unchanged', () => {
    expect(sanitizeText('Hello, world! How are you?')).toBe('Hello, world! How are you?');
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('strips multiple dangerous patterns combined', () => {
    const input =
      '<script>bad()</script>click <span onclick="hack()">here</span> <a href="javascript:doEvil()">link</a>';
    expect(sanitizeText(input)).toBe('click here link');
  });

  it('handles case-insensitive script tags', () => {
    expect(sanitizeText('<SCRIPT>alert(1)</SCRIPT>')).toBe('');
    expect(sanitizeText('<Script>alert(1)</Script>')).toBe('');
  });

  it('handles case-insensitive javascript: URIs', () => {
    expect(sanitizeText('JavaScript:alert(1)')).toBe('alert(1)');
  });
});

// ============================================================
//  buildRagPrompt
// ============================================================

describe('buildRagPrompt', () => {
  it('returns system + user message with no chunks or history', () => {
    const messages = buildRagPrompt('What is Rust?', []);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Daniel Maricic');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('What is Rust?');
  });

  it('includes numbered context chunks with relevance scores', () => {
    const chunks = [
      { title: 'Rust Post', text: 'Rust is safe.', score: 0.95 },
      { title: 'Go Post', text: 'Go is fast.', score: 0.5 },
    ];
    const messages = buildRagPrompt('Languages?', chunks);
    const systemMsg = messages[0].content;

    expect(messages).toHaveLength(2);
    expect(systemMsg).toContain('[1] From "Rust Post"');
    expect(systemMsg).toContain('relevance: 0.95');
    expect(systemMsg).toContain('Rust is safe.');
    expect(systemMsg).toContain('[2] From "Go Post"');
    expect(systemMsg).toContain('relevance: 0.50');
    expect(systemMsg).toContain('Go is fast.');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Languages?');
  });

  it('appends history before the current question', () => {
    const messages = buildRagPrompt(
      'What next?',
      [],
      [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
      ],
    );
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('First question');
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toBe('First answer');
    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toBe('What next?');
  });

  it('filters out non-user/assistant history messages', () => {
    const messages = buildRagPrompt(
      'Question',
      [],
      [
        { role: 'user', content: 'Hi' },
        { role: 'system', content: 'You are...' },
        { role: 'assistant', content: 'Hello' },
        { role: 'tool', content: 'result', tool_call_id: '123' },
      ],
    );
    // Messages: system (system prompt) + user (Hi) + assistant (Hello) + user (Question) = 4
    // System role and tool role messages are filtered out of history
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hi');
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toBe('Hello');
    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toBe('Question');
  });

  it('handles undefined history', () => {
    const messages = buildRagPrompt('Question', [], undefined);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('handles empty history array', () => {
    const messages = buildRagPrompt('Question', [], []);
    expect(messages).toHaveLength(2);
  });
});

// ============================================================
//  isAvailable
// ============================================================

describe('isAvailable', () => {
  it('returns false when API responds with non-OK status', async () => {
    const mockFetch = mock(() => Promise.resolve({ ok: false, status: 401 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    expect(await isAvailable()).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    const mockFetch = mock(() => Promise.reject(new Error('network error')));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    expect(await isAvailable()).toBe(false);
  });

  it('returns true when API responds OK', async () => {
    const mockFetch = mock(() => Promise.resolve({ ok: true }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    expect(await isAvailable()).toBe(true);
  });

  it('uses correct URL and auth header', async () => {
    const mockFetch = mock(() => Promise.resolve({ ok: true }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    await isAvailable();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.local/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test-key-12345' },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

// ============================================================
//  chatStream (basic smoke test)
// ============================================================

describe('chatStream', () => {
  it('returns a Stream<LLMEvent> (not ReadableStream)', async () => {
    // Can't easily mock streamText in Bun module scope,
    // so verify the function signature and return type structure
    const stream = chatStream([{ role: 'user' as const, content: 'test' }]);
    // Should be an Effect Stream, not a ReadableStream
    // Stream has a 'pipe' method (Effect Stream API)
    expect(stream).toBeDefined();
    expect(typeof stream.pipe).toBe('function');
  });
});

describe('chatStreamWithTools', () => {
  it('returns a Stream<LLMEvent> with no tools provided', () => {
    const stream = chatStreamWithTools([{ role: 'user' as const, content: 'test' }], []);
    expect(stream).toBeDefined();
    expect(typeof stream.pipe).toBe('function');
  });
});
