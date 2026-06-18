---
published: false
title: 'Taming the AI Tool Loop: What Happens When the Model Never Gets a Turn Without Tools'
slug: 'taming-the-ai-tool-loop'
description: 'How woss.io evolved from a 41-character AI answer to a 4-layer defense against tool-calling doom loops — with cross-round fingerprinting, synthesis rounds, and lessons from opencode.'
date: 2026-06-13
tags:
  - LLM
  - tool loops
  - prompt engineering
  - architecture
  - woss.io
  - opencode
featured: false
part_of_series: 'new-woss-io'
---

## The 41-Character Answer

A user asked: _"Show me Daniel's pull requests."_

The AI responded: `"Now let me get the closed/merged PRs too."`

Forty-one characters. Not an answer. A promise of an answer that never came.

The logs told the story: the model called tools in round 1, got results, called tools in round 2, got more results, called tools in round 3 — then hit the recursion limit and returned whatever partial text it had produced. Three rounds of tool calls, zero rounds of synthesis. The model was never given a turn where it couldn't call tools.

This is the story of how woss.io evolved from that 41-character bug into a robust 4-layer defense system against AI tool loops. And how studying [opencode](https://github.com/anomalyco/opencode) — an open-source AI coding assistant — helped me understand what I was doing wrong.

## The Architecture Problem

When an LLM calls external tools (searching GitHub, querying a media library), the tool results need to flow back into the model's context so it can use them to produce an answer. This creates a multi-round loop:

1. Model decides to call a tool → execute → append result → back to model
2. Model decides to call another tool → execute → append result → back to model
3. Model decides it has enough information → produce final answer

Two fundamentally different architectures solve this:

### opencode's Approach: The Persistent Outer Loop

opencode uses a `SessionPrompt.loop()` that persists across LLM calls. Tools are **always available**. The loop is:

```
finishReason "tool-calls" → execute tools → append results → GOTO 1
finishReason "stop" → DONE
```

Safety layers sit on top:

- **tool-loop-guard.ts** — fingerprints tool+args, terminates repeats
- **processor.ts** — same tool 3x → interrupt
- Thinking loop detection, schema validation, tool output truncation

### woss.io's Approach: Recursive Inner Rounds

woss.io uses the Vercel AI SDK's `streamText` with a recursive `runRound()` function. Tools are **removable per round**:

```
streamText() → onFinish → check tool calls → recurse or resolve
MAX_ROUNDS = 3 (dropping to final round without tools)
```

The core difference: opencode's outer loop can retry with tools forever. woss.io's inner rounds cap at 3, then forcibly remove tools.

## The Root Cause: One Line in a Prompt

The bug traced back to `prompts.ts`. The tool system prompt told the model:

```
VERIFY: When you need up-to-date repository metadata and the existing context
(RAG history) does not already contain it, call search_repositories. If you
already have the data you need, use what you have — don't re-verify.
```

And earlier, an even stricter version:

```
ALWAYS call search_repositories... Do NOT skip even if RAG already covers it.
```

The model interpreted this as a perpetual instruction. Pattern:

1. Model calls `search_repositories("woss")` → gets results → writes "Let me check..."
2. Model sees instruction: "ALWAYS verify" → calls `search_repositories("woss")` again
3. Same tool, same args, same result → writes "...ok let me look further..."
4. Repeat until `MAX_ROUNDS` hits

The model wasn't broken. It was following instructions. The instruction told it to always verify, so it always verified.

## The Fix: 4 Defense Layers

### Layer 1: Cross-Round Fingerprinting

In `openai-provider.ts`, the `chatStreamWithTools()` function tracks every tool call across all recursive rounds using tool+args fingerprints:

```typescript
// Build cross-round tool+args fingerprints for doom loop detection
for (const tc of roundToolCallRecords) {
  const fingerprint = `${tc.toolName}::${JSON.stringify(tc.input)}`;
  const count = (crossRoundFingerprintCounts.get(fingerprint) ?? 0) + 1;
  crossRoundFingerprintCounts.set(fingerprint, count);
}
const toolLoopDetected = [...crossRoundFingerprintCounts.values()].some((c) => c > CROSS_ROUND_THRESHOLD); // threshold = 3
```

The key insight: **tool name alone isn't enough**. A model legitimately calling `search_repositories("woss")` and `search_repositories("opencode")` is different from calling `search_repositories("woss")` three times. The fingerprint includes both the tool name _and_ the serialized arguments.

When detected:

```typescript
if (isDoomLoop) {
  log.warn`[llm-round] Cross-round tool loop detected — forcing final round without tools`;
  doomLoopDetectedInRound = true;
}
```

### Layer 2: The Synthesis Round

This is the structural fix. When `runRound` reaches `MAX_ROUNDS` (default 3) and the model still wants to call tools:

```typescript
if (roundToolCalls > 0 && roundTextLength > 0 && (reachedMaxRounds || isDoomLoop)) {
  // Force final round WITHOUT tools — the model MUST produce text
  log.info`[llm-round] MAX_ROUNDS=${MAX_ROUNDS} reached — forcing final round without tools`;
  runRound(round + 1, undefined)
    .then(resolve)
    .catch(reject);
}
```

Setting `currentToolSet` to `undefined` in the recursive call means the next `streamText` invocation has **no tools at all**. The model has zero options except to produce text. This is the synthesis round — the first time in the conversation the model is forced to write an answer instead of deferring to another tool call.

### Layer 3: The Tiny-Text Check

Even with the synthesis round, sometimes the model would produce a stub like "Here they are:" (15 chars) and stop. The post-stream check catches this:

```typescript
const isTinyText = anySuccessfulToolCalls && answerText.trim().length > 0 && answerText.trim().length < 100;
```

If the model called tools but produced fewer than 100 characters of answer text, the entire response is discarded and retried with a hardened system prompt.

### Layer 4: Retry Orchestration

The `streamWithRetry()` function in `generate.ts` orchestrates up to 10 attempts (up from the original 3):

```typescript
for (let attempt = 0; attempt < 10; attempt++) {
  // ...
  if (answerText.trim().length === 0 || isDoomLoop || isTinyText || isToolLoop) {
    // Harden system prompt with getDoomLoopRecoveryPrompt()
    messages[0].content += '\n\n' + getDoomLoopRecoveryPrompt();
    // Disable tools sooner — drop on attempt 2 instead of 3
    if (attempt >= 2) mcpToolDefs = null;
    continue;
  }
}
```

The recovery prompt is blunt:

> _MANDATORY INSTRUCTION: Your previous response was a failure — you called tools but produced NO answer text. You are being retried. For this attempt: DO NOT call any tools. IGNORE any available tools. Use only the information you already have and write a complete, well-formatted answer immediately. Even if you have nothing to say, write SOMETHING — a greeting, an apology, anything. Producing NO text is unacceptable. You MUST write at least one sentence._

### Bonus: Rate-Limit Cascade Prevention

A complementary fix in `provider.ts` prevents rate-limit retry cascades. The AI SDK internally retries 3 times on 429 responses, then throws. The outer loop would then retry 10 more times — 30 wasted API calls taking ~45 seconds.

The fix maps 429 to 400 at the fetch layer:

```typescript
if (response.status === 429) {
  const body = await response.text();
  if (body.includes('Rate limit') || body.includes('FreeUsageLimitError')) {
    log.warn`Rate limit 429 detected, mapping to 400 to skip SDK internal retries`;
    return new Response(body, {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    });
  }
}
```

The AI SDK doesn't retry on 400. The outer loop catches it and breaks immediately.

### Bonus: The RAG Safety Net

There's one more failure mode that doesn't look like a tool loop but
shares the same root cause: the model gets stuck without tools, and RAG
never fires.

In the original architecture, the RAG retrieval step was gated by a
`needsAnyTool` flag:

```typescript
// Before: RAG only runs when tools are needed
if (needsAnyTool) {
  ragResults = await retrieveContext(query);
}
```

This made sense in isolation — why fetch RAG context if the model has
tools to find the data itself? But the logic broke in practice: when a
user asked something that didn't match any MCP tool signature, the
classifier returned `needsAnyTool = false`, RAG never ran, and the
model received zero context. No tools, no RAG, nothing.

The fix (commit `bfbf993` on Jun 10) removed the gate entirely:

```typescript
// After: RAG always runs, regardless of tool needs
ragResults = await retrieveContext(query);
```

RAG now runs on **every** query. If tools are also needed, both fire.
If no tools are needed, the model still gets RAG context. The cost is
a database query and embedding comparison — milliseconds — and the
benefit is that the model never faces a blank context window.

This fix complements the tool loop defenses in a specific way: it
reduces the pressure on the tool system. When the model already has
relevant context from RAG, it's less likely to keep calling tools
to "verify" things it already knows. Fewer tool calls means fewer
opportunities for loops.

## opencode vs woss.io: Defense-in-Depth Comparison

| Concern            | opencode                            | woss.io                             |
| ------------------ | ----------------------------------- | ----------------------------------- |
| Loop model         | Outer persists (SessionPrompt.loop) | Inner recursion (runRound)          |
| Tools availability | ALWAYS available                    | Removable per round                 |
| Doom detection     | Fingerprint + 3x repeat             | Fingerprint + 3x repeat + tiny-text |
| Synthesis forcing  | tool-loop-guard terminates          | Tools=undefined forces output       |
| Retry count        | Interrupt-based                     | Up to 10 attempts                   |
| Prompt hardening   | N/A                                 | getDoomLoopRecoveryPrompt()         |
| 429 handling       | Falls through to SDK retries        | 429→400 short-circuit               |

Both solve the same problem differently. opencode's advantage: tools are always available, so a recovery attempt can still use tools. woss.io's advantage: the model is guaranteed a no-tools round, preventing infinite loops structurally rather than reactively.

## The Key Insight

The single realization that made everything click:

**The model was never broken — it was never given a turn without tools.**

Every time the model wanted to call a tool, it could. Every round had tools enabled. The model optimized for what the prompt told it: "ALWAYS verify." The fix wasn't better prompting (though that helped). It wasn't better tool definitions (though that helped too). The fix was structural: **guarantee the model has at least one round where it cannot defer to a tool**.

This is the difference between defense-in-depth and defense-in-structure. Layers 1, 3, and 4 are defense-in-depth — they catch failures. Layer 2 (the synthesis round) is defense-in-structure — it prevents the failure mode from existing.

## Lessons Learned

**1. Prompt instructions are code, and they have bugs.**

A single line — "ALWAYS call search_repositories" — caused the entire doom loop. Soften perpetual instructions. Add explicit stop conditions. Test them like you test code paths.

**2. Tool+args fingerprints > tool name fingerprints.**

Same tool with different args is legitimate multi-step reasoning. Same tool with same args is a loop. The args are what distinguish the two.

**3. Structural protections beat reactive protections.**

The synthesis round prevents the loop before it starts. The tiny-text check and retry loop catch failures after they happen. You need both, but structural is more reliable.

**4. Study open-source battle-tested patterns.**

opencode's tool-loop-guard and processor code showed me what a production system looks like. I didn't copy it — I understood the problem space differently after reading it. The persistent outer loop vs recursive inner round tradeoff became clear only after seeing both implementations.

**5. Rate-limit cascades are silent cost killers.**

30 API calls per failure, 45 seconds of wait time — and the response still fails. Short-circuiting at the wire level (429→400) and at the orchestration level (break on rate-limit error) is essential for any LLM application.

## The Code

All relevant source files in the woss.io repository:

- **`src/lib/server/openai-provider.ts`** — `chatStreamWithTools()` (line 257), `runRound()` (line 290), cross-round fingerprinting (line 377), synthesis round (line 438)
- **`src/lib/server/generate.ts`** — `streamWithRetry()` (line 481), tiny-text check (line 644), retry loop (line 516), rate-limit abort (line 683)
- **`src/lib/server/prompts.ts`** — `getToolSystemPrompt()` (line 30), `getDoomLoopRecoveryPrompt()` (line 165)
- **`src/lib/server/llm/provider.ts`** — `customFetch()` with 429→400 mapping (line 66)
- **`src/lib/server/config.ts`** — `MAX_ROUNDS=3`, `CROSS_ROUND_THRESHOLD=3` (line 67)
- **`e2e/synthesis-fix.spec.ts`** — end-to-end test validating the complete pipeline

---

_This post is part of a series on building woss.io — an AI-native personal portfolio. Earlier posts covered the [system prompt positioning fix](/posts/system-prompt-position-matters) and [Macula MCP tool design lessons](/posts/designing-mcp-for-llms)._
