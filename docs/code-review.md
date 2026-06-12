## Code Review: Full Codebase

### Files Reviewed

108 TypeScript/Svelte files across `src/` — critical paths:

- `src/lib/server/generate.ts` (1147 lines)
- `src/lib/server/db.ts` (898 lines)
- `src/lib/server/openai-provider.ts` (522 lines)
- `src/lib/server/mcp/tools.ts` (315 lines)
- `src/lib/server/mcp/manager.ts` (404 lines)
- `src/routes/chat/[id]/+page.svelte` (869 lines)
- `src/lib/components/ChatMessage.svelte` (968 lines)
- `src/routes/api/ask/+server.ts` (187 lines)
- `src/lib/query-classifier.ts`

### Overall Assessment

**NEEDS_DISCUSSION** — Codebase is structurally well-architected at high level (MCP pipeline, SSE streaming, Effect.ts streams) but has significant maintainability debt from monolithic files, positional parameter proliferation, and logic sprawl in component effects.

### Summary

The system is a SvelteKit chat application with LLM-based generation, MCP tool orchestration, RAG retrieval, and real-time SSE streaming. Core architecture is solid — the EventSource streaming, Effect.ts `Stream` integration, and MCP client abstraction are well done. Three files account for ~60% of all issues: `generate.ts` (pipeline orchestrator doing too much), `db.ts` (monolithic DAL), and `+page.svelte` (200-line SSE effect handler in a component). Primary concerns are maintainability trajectory and fragile error handling through positional parameter overloads.

---

### Critical Issues (🔴)

**C1 — `addMessage` 16 positional parameters, called dozens of times with partial/undefined args (`src/lib/server/db.ts:476`)**

Every call site must pass 16 arguments in exact order. `generate.ts` calls it ~16 times across `handleEarlyGates`, `saveAndEmitResult`, `startGeneration` — each time padding with `undefined` for unused params. The `SaveResultParams` object (line 710) was created for `saveAndEmitResult` but `addMessage` itself lacks the same treatment. A single misaligned argument inserts wrong data into the wrong columns.

Example at `generate.ts:273-290`:

```ts
addMessage(
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
  true,
  'I can only answer questions...',
  undefined,
  userAgentId,
);
```

Mapping `undefined` to the wrong position (e.g., swapping `error` and `queryType`) silently stores data in the wrong column — SQLite has no schema-enforced differentiation between an empty string and `null` for these columns.

**C2 — SSE handler is a 200-line `$effect()` block in a Svelte component (`src/routes/chat/[id]/+page.svelte:515-728`)**

The effect registers 8 event listeners (`token`, `done`, `contact_intent`, `tool_call_start`, `tool_call_end`, `status`, `error`, `onerror`), manages a 120s timeout, and mutates `messages` state directly from within event callbacks. This is untestable, impossible to reuse, and creates a new `EventSource` on every component mount. The `seenErrorMsgIds` set (line 512) is a manual dedup mechanism that wouldn't be needed if SSE events were processed through a proper state machine.

---

### Major Issues (🟠)

**M1 — Silent catch blocks across the codebase (~20+ occurrences)**

Most `fetch`/`async` calls are wrapped in `try/catch` with `/* ignore */` or empty catches. Examples: `+page.svelte:139`, `:185`, `:202`, `:232`, `:287`. This means network errors, parse failures, and server errors are silently swallowed. The user sees stale UI state while the server is in an error condition. At minimum, log the error.

**M2 — `handleEarlyGates` makes up to 3 LLM calls before the main generation (`generate.ts:226-459`)**

The pipeline calls `isRelevant` (1 LLM call), potentially `classifyToolNeeds` (2nd LLM call), and `generatePoliteResponse` (3rd LLM call) — all before `streamWithRetry` starts the main generation. Each call adds latency and can fail independently. The polite check (line 310, regex patterns) could run before the relevance check to short-circuit faster.

**M3 — `streamWithRetry` retries up to 10 times with tools disabled after attempt 3 (`generate.ts:530`)**

The comment "change from 3 to 10 attempts" suggests a workaround for a pattern issue rather than a fix. Each retry consumes LLM tokens (re-sends full message history with a hardened system prompt). If the model is in a doom loop, disabling tools at attempt 3 is correct, but 7 more attempts with no tools and an increasingly desperate system prompt is wasteful.

**M4 — No CSRF or origin validation on API endpoints (`src/routes/api/*`)**

Endpoints like `/api/chat/*`, `/api/messages/*/reaction`, `/api/ask` accept POST requests with `userId` from the client. There's no CSRF token, no origin header check, and no authentication. A malicious site could make requests on behalf of a user. The `userId` in localStorage is trivially exfiltratable via XSS.

**M5 — Tool call SQL inserts happen synchronously inside streaming hot path (`generate.ts:586-595`)**

`db.prepare(...).run(...)` for each tool call runs synchronously (better-sqlite3) inside the LLM stream processing loop. If the DB write is slow (WAL checkpoint, lock contention), it stalls the entire stream. These should be queued or written asynchronously.

**M6 — `ChatMessage.svelte` (968 lines) handles too many concerns**

Single component handles: markdown rendering + image wrapping (18 lines of custom renderer rules), reaction up/down/heart, sources display + scoring, tool call grouping + live timing, copy-as-markdown, copy-message-link, deleted message state, error display with retry, query-type badges. At minimum, extract: `MessageReactions.svelte`, `MessageSources.svelte`, `ToolCallList.svelte`.

---

### Minor Issues (🟡)

**m1 — `db.ts` (898 lines) mixes chat, content, reactions, leads, vector search in one module**

Domain responsibilities: chat CRUD (messages, chats), content retrieval (posts/experience by slug), reactions, leads, vector index management, connection lifecycle. Extract into `src/lib/server/db/chat.ts`, `db/content.ts`, `db/reactions.ts`, `db/vector.ts`.

**m2 — `generate.ts` (1147 lines) mixes pipeline orchestration, caching, streaming, tool classification**

`handleEarlyGates` (227 lines) does relevance + polite + embedding + cache in one function. `streamWithRetry` (186 lines) does streaming + retry + post-processing + safety nets. Extract: `src/lib/server/pipeline/gates.ts`, `src/lib/server/pipeline/stream.ts`, `src/lib/server/pipeline/save.ts`.

**m3 — System prompts embedded as template literals in code (`tools.ts`, `generate.ts`)**

`classifyToolNeeds` at `generate.ts:159-169` has a multi-line system prompt string. `getSystemPromptAddition` in `tools.ts` also builds prompts via concatenation. Prompts should be in their own files (`.md` or `.txt`) and loaded, making them auditable and modifiable without code changes.

**m4 — `tryRenameChat` called inconsistently on return paths**

Called after polite path (line 364), after cache hit (line 446), but NOT after error paths in `handleEarlyGates` or the embedding failure path. The chat title stays as "New Chat" until the next successful user message.

**m5 — `isRelevant` causes a chat lock on false — no user appeal (`generate.ts:271`)**

If the relevance classifier returns false (off-topic), the chat is immediately locked with `lockChat(chatId)` and an irrecoverable error is emitted. The user cannot retry or rephrase. A false positive means the user loses the entire conversation.

**m6 — `runRound` recursion in `openai-provider.ts:284-433`**

Recursive `async function` defined inside `Stream.asyncPush` closure. `MAX_ROUNDS` defaults to... (undefined, only `FIRST_ROUND_MAX_STEPS` is configured). Recursion depth is bounded by `MAX_ROUNDS` but the pattern of pushing to `currentMessages` in a closure creates implicit memory pressure and makes reasoning about message flow difficult.

**m7 — No test files found for server modules**

No test files exist under `src/lib/server/` for `generate.ts`, `db.ts`, `openai-provider.ts`, or `mcp/`. The `query-classifier` also has no tests. This is a significant coverage gap for the core business logic.

---

### Positive Observations (🟢)

- **Effect.ts Stream integration**: Using `Stream.asyncPush` with `Effect.acquireRelease` for proper cleanup of LLM streaming (abort signal, connection teardown) is well done. The `emit.end()` / `emit.fail()` pattern ensures the consumer always terminates cleanly.

- **Type-safe event factories**: `openai-provider.ts:22-64` defines factory functions for each `LLMEvent` type instead of ad-hoc object literals. This prevents event shape drift and makes adding new event types safer.

- **ToolCallXmlStripper class**: Clean state machine design with `#inBlock` state tracking and regex-based tag detection. Handles cross-chunk tool call blocks properly. Good encapsulation.

- **`saveAndEmitResult` parameter object**: `SaveResultParams` interface at `generate.ts:710` is the right pattern — one interface instead of 16 positional args. This should be applied to `addMessage` and `handleEarlyGates` as well.

- **Cache-first architecture**: Semantic cache check before LLM generation is well-integrated. The composite cache key (current + previous user message) is clever — catches follow-up questions to the same topic.

- **MCP abstraction**: `manager.ts` cleanly separates connection lifecycle, tool resolution with collision handling, and execution routing from the rest of the pipeline.

- **SSE timeout with autoreconnect**: 120-second timeout in the client with EventSource's built-in reconnection is robust. The `resetSseTimeout` pattern on each event prevents premature timeout during long generations.

---

### Philosophy Compliance

| Law                          | Status | Notes                                              |
| ---------------------------- | ------ | -------------------------------------------------- |
| Law 1: Single Responsibility | ⚠️     | 3 files exceed 800 lines, mixing concerns          |
| Law 2: Explicit Data Flow    | 🔴     | 16-positional `addMessage` is anti-pattern         |
| Law 3: Fail Fast             | 🟠     | Silent catch blocks violate this                   |
| Law 4: Defend at Boundaries  | 🟢     | Input validation, sanitizeText, SQL prepared stmts |
| Law 5: Test at Interfaces    | 🔴     | No tests for server core modules                   |

### Recommendations (Priority Order)

1. **P1**: Refactor `addMessage` to accept a parameters object (match `SaveResultParams` pattern)
2. **P1**: Extract SSE event handling from `+page.svelte` into a composable store
3. **P2**: Add error logging to all silent catch blocks
4. **P2**: Add CSRF/origin validation to API routes
5. **P2**: Split `db.ts` by domain
6. **P2**: Extract sub-components from `ChatMessage.svelte`
7. **P2**: Add unit tests for `query-classifier`, `generate.ts` gates
8. **P3**: Move system prompts to files
9. **P3**: Reduce `streamWithRetry` max attempts from 10 to 3-4
10. **P3**: Add `tryRenameChat` call on error return paths
