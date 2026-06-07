---
title: 'Building woss.io: A Journey Into AI-Powered Personal Portfolios'
featured: true
description: 'How we rebuilt woss.io from the ground up — an AI-native personal portfolio with streaming LLM chat, local vector embeddings, MCP tool integration, and a modern SvelteKit 5 stack.'
date: 2026-06-06
tags:
  - woss.io
  - SvelteKit
  - Svelte 5
  - Tailwind CSS
  - AI
  - RAG
  - vector search
  - MCP
  - TypeScript
  - SQLite
  - web development
  - portfolio
header_image: '[Space whale](https://u.macula.link/Z1TIROJeSMmFYnmvlCOPLg-7?preset=sys_md)'
---

The old woss.io was static. A simple portfolio page, blog posts rendered from markdown, a contact form. It worked, but it didn't reflect how I actually work — with AI tools daily, building systems that reason, search, and generate.

I wanted a site that could talk back. Not a chatbot bolted on as a gimmick, but a site where AI is the primary interface — visitors ask questions, the AI searches my career history, reads my blog posts, explores my GitHub projects, and answers in real-time.

This is the story of building that.

## The Stack

```
SvelteKit 5 + Svelte 5 (Runes)
Tailwind CSS v4
TypeScript 5.9
SQLite (better-sqlite3)
USearch (vector index)
Vercel AI SDK + Effect.ts
Transformers.js (local ONNX embeddings)
MCP (Model Context Protocol)
```

Every choice was deliberate.

**SvelteKit 5** over Next.js. I've worked with both. SvelteKit's file-based routing is simpler, the Runes reactivity model (Svelte 5's `$state`, `$derived`, `$effect`) is more explicit than React hooks without the mental overhead of dependency arrays. The `adapter-node` deployment model — build, copy, run — fits a single-server SQLite setup perfectly.

**Tailwind CSS v4** with the `@theme` directive for design tokens. v4 drops the config file entirely — everything lives in a single `app.css` with `@theme {}` blocks. Font stack, border radii, shadows, animations — all defined once, used everywhere. The `@tailwindcss/typography` plugin handles blog prose rendering with zero custom CSS for markdown content.

**SQLite** because a personal site doesn't need Postgres. `better-sqlite3` is synchronous, fast, and trivially portable. The entire database is one file (`data/woss.db`). Backups are `cp`. No Docker volume management. No connection pooling.

**USearch** for vector search. 1024-dimensional embeddings, Cosine similarity, BF16 quantization. Fast enough for real-time RAG on a single server. No external vector database to manage.

**Transformers.js** for local embeddings. The BGE model runs in-process via ONNX. No external embedding API, no network calls, no API keys. Model loads ~1.3GB on first request, then stays cached. Batch inference for indexing, single-pass for queries.

## The AI Chat: Core Architecture

The chat is the heart of the site. Every question hits a pipeline that looks like this:

```
User types question
  → classify query (tool needs? RAG needs?)
  → embed query (Transformers.js)
  → vector search (USearch, top-5 chunks)
  → build RAG prompt with context
  → stream LLM response (SSE)
  → if tools needed: classify tool type → execute MCP tools → retry with results
```

### Streaming

The streaming pipeline uses the [Vercel AI SDK](https://sdk.vercel.ai/docs) with Effect.ts for typed event streaming:

```
chatStreamWithTools()
  → Effect.Stream<LLMEvent>
  → text-delta, reasoning-delta, tool-call, tool-result, step-finish, finish
```

Each SSE event from the LLM is parsed and emitted as typed LLMEvent objects — text deltas for real-time token display, tool call events for rendering MCP tool execution status, step-finish events for tracking reasoning progression.

The frontend subscribes via Server-Sent Events:

```typescript
// Frontend: each token appended directly to message text
const source = new EventSource(`/api/ask/${chatId}`);
source.addEventListener('token', (e) => {
  const data = JSON.parse(e.data);
  messages[idx].text += data.token;
});
```

No frontend buffering. No message assembly. Each token arrives and renders.

### RAG Pipeline

When a question comes in, we embed it locally, search the vector index for the top-5 most similar content chunks, and pack them into the system prompt:

```
You are an AI assistant for woss.io.
Answer based on these sources:
  [1] "Experience: Ipsos Simstore" — Senior DevOps, Platform Architect...
  [2] "Post: Building opencode-visualizer" — Deno, SQLite, ANSI...
  [3] "Experience: Web3 Foundation Grants" — Substrate, WASM...

If the answer isn't in the sources, use available MCP tools.
```

The RAG prompt is built in `openai-provider.ts` as `buildRagPrompt()`. Sources are rendered with title, URL, and key content — the LLM reads them as context.

### Tool Calling via MCP

This is where it gets interesting. The site uses the Model Context Protocol to give the LLM access to real tools:

- **GitHub MCP** — search repositories, list issues, read files, explore pull requests
- **Macula MCP** — search images, browse keywords, traverse media collections

When a user asks "What projects do you have on GitHub?", the LLM doesn't make up an answer. It calls `search_repositories` via MCP, reads the results, and summarizes them. Real data, every time.

The tool classification uses a two-tier approach:

1. **Keyword fast path**: Short messages with explicit references to "GitHub", "repos", "code" → immediately classified as needing GitHub tools
2. **LLM fallback**: Ambiguous messages → LLM classifies the intent (github, macula, both, or none)

This avoids an LLM call for obvious tool requests while maintaining accuracy for complex queries.

### Retry Logic & Fallbacks

LLMs are unreliable. Sometimes they produce tool calls but no answer text. Sometimes they stall. The system has layers of defense:

```typescript
// In generate.ts — if LLM calls tools but produces no text:
if (hasToolCalls && !hasText) {
  // Retry with MANDATORY INSTRUCTION: don't call tools, just write
  const retryMessage = `MANDATORY INSTRUCTION: Your previous response was a failure — 
    you called tools but produced NO answer text. DO NOT call any tools. 
    Use only the information you already have and write a complete answer.`;
}
```

If the retry also fails, the system falls back to a simpler non-tool stream. Two layers of fallback — the user always gets something, even if it's less sophisticated.

## Local Embeddings: The Surprising Beast

Running a local embedding model in a Node.js server was the most technically interesting challenge.

```typescript
// embed.ts — lazy-loading ~1.3GB model via Transformers.js
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (_extractor) return _extractor;
  if (!_extractorPromise) {
    _extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: 'fp32',
    }).then((p) => {
      _extractor = p;
      return _extractor;
    });
  }
  return _extractorPromise;
}
```

Key design decisions:

**Promise-based mutex for first load**: The model is ~1.3GB and takes 5-10 seconds to load on first request. Multiple concurrent requests on a cold start would each trigger a separate model load without the mutex. With it, they all await the same promise.

**Cache directory inside data volume**: `env.cacheDir = join(process.cwd(), 'data', '.hf-cache')` — this survives container rebuilds so the model isn't re-downloaded on every deployment.

**Batch inference for indexing**: `embedTexts()` processes multiple texts in one ONNX inference call. Building the initial search index over 1000+ content chunks would be slow one-at-a-time. Batch inference cuts the time by ~10x.

**Pooling and normalization**: Mean pooling across token embeddings + L2 normalization. The BGE model's output is pooled to a single 1024-dimensional vector per text.

## Vector Search with USearch

USearch is a lightweight vector similarity library. No server, no external dependencies — just a file index.

```typescript
// Loading the index
const index = new USearchIndex();
index.load('./data/vectors.usearch');

// Search
const results = index.search(queryVector, 5);
// Returns [chunkId, chunkId, ...] sorted by Cosine similarity
```

The index stores chunk IDs. We map those back to content in SQLite:

```sql
SELECT title, content, type, slug
FROM page_chunks
WHERE id IN (?, ?, ?)
```

The join of vector similarity + SQLite metadata is fast enough for real-time responses. No Postgres, no Pinecone, no Qdrant. One file, zero network calls.

## The Experience Timeline

The career history page was a design challenge. Most portfolio sites show a boring list of jobs with dates. I wanted something visual — bars spanning time ranges, color-coded by era, with rich detail on click.

The data model is simple markdown files with YAML frontmatter:

```yaml
---
company: 'Ipsos Simstore'
role: 'Senior DevOps, Platform Architect & AI Adoption Lead'
startDate: '2023-08'
endDate: null  # current position
company_tags:
  - market research
  - data-driven insights
skills:
  - aws
  - terraform
  - kubernetes
---
```

15 entries spanning Daniel's career — from founding startups to Web3 Foundation grants to DevOps architecture. Each entry renders as a horizontal bar positioned absolutely along a timeline axis, with `startDate` and `endDate` mapping to CSS `left` and `width`.

Users can click any entry for full details, or use "Copy as Markdown" / "Copy as llms.txt" to export for LLM context files.

## The Blog System

Blog posts are markdown files in `src/content/posts/` with YAML frontmatter:

```yaml
---
title: 'Building opencode-visualizer: A Terminal Dashboard...'
description: 'A terminal dashboard for OpenCode usage data...'
date: 2026-06-04
featured: true
tags:
  - opencode
  - CLI tools
  - Deno
header_image: '[Alt](https://example.com/image.png)'
---
```

The build pipeline ingests them into SQLite:

```typescript
// build-index.ts
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

// Parse frontmatter → extract TOC → render HTML → store in DB
```

Rendering uses `unified` + `remark-parse` + `remark-rehype` + `rehype-highlight` for syntax highlighting + `rehype-slug` for heading anchors. The TOC is extracted via regex heading matching during indexing and stored alongside the rendered HTML.

The result: fast page loads (content is pre-rendered at build time and served from SQLite), syntax-highlighted code blocks, and navigable heading structure.

## Design Philosophy

The visual design follows a few principles:

**Dark mode first**. The site is designed in dark mode, with light mode as a secondary concern. `mode-watcher` handles the toggle. Dark mode isn't an afterthought — it's the primary experience.

**Typography as structure**. The font stack tells the hierarchy: `SS Standard` (monospace) for headings, `Inter` for body text, `JetBrains Mono` for code. No custom fonts loaded from CDN — all system fonts or self-hosted.

**Minimal UI, maximal functionality**. The chat page is just messages and an input. No buttons, no toolbars, no settings panels. The experience page is bars and dates. The blog is a grid of cards with header images. Each page does one thing.

**Animations that serve purpose**. `message-in` for new chat messages, `page-enter` for route transitions, `pulse-dot` for the typing indicator. Subtle, non-disruptive, intentional. No loading spinners — the streaming response IS the loading state.

## Infrastructure

The deployment is dead simple:

```dockerfile
# Dockerfile
FROM node:22-slim
COPY build/ /app/
COPY data/ /app/data/
CMD ["node", "build/index.js"]
```

A single Docker container running behind a reverse proxy. SQLite file on a persistent volume. No orchestrator, no service mesh, no cloud database.

The `VPS Setup` guide (checked into docs/) walks through the full deploy — Caddy as reverse proxy with automatic HTTPS, systemd service with auto-restart, log rotation via logtape.

## Lessons Learned

**Local embeddings are viable**. I started this project assuming I'd need an external embedding API (OpenAI, Cohere, etc.). Transformers.js proved me wrong. The BGE model runs comfortably in a $10/month VPS. Inference takes ~50ms per query. No API costs, no rate limits, no data leaving the server.

**MCP changes everything about portfolio AIs**. Without MCP, the LLM would guess about my GitHub projects. With it, it searches my actual repos, reads my actual code, lists my actual issues. The difference between "sounds plausible" and "provably correct" is night and day.

**Effect.ts streams beat callbacks**. The first version of the streaming pipeline used raw Node.js callbacks. It was brittle — unhandled errors in middle of a stream would crash the response. Effect.ts's typed `Stream` type provides structured error handling, backpressure, and composability that callbacks cannot match.

**Svelte 5 Runes are genuinely good**. I was skeptical of the Runes API after years with Svelte 4 stores. After building with it, I'm converted. `$state()` with `$derived()` replaces most store patterns more cleanly. The `$effect()` lifecycle hook is explicit about when and why side effects run. TypeScript integration is seamless.

**Rate limiting is essential**. An unprotected AI chat endpoint would be bankrupt in hours. The IP-based rate limiter (`src/lib/server/rate-limiter.ts`) uses SQLite for persistent counters with configurable windows. 10 requests per hour for the contact form, higher for chat. The system does not block — it slows and warns.

**Your personal site should dogfood your skills**. The site is a showcase, but it's also a testbed. MCP integration, local embeddings, streaming LLM responses — these are technologies I work with daily, and the site proves they work in production. A static portfolio page tells people what you've done. An AI-powered one shows them.

## What's Next

- **Multi-LLM routing**: Route questions to specialized models — code questions to DeepSeek, creative questions to Claude, quick answers to a small local model
- **Real-time collaboration**: Shared chat sessions for collaborative debugging with visitors
- **Expanded MCP tools**: Add more data sources — blog RSS feeds, conference talks, open-source contributions
- **Spatial embedding visualization**: A 3D embedding space explorer (already prototyped in `docs/embedding-space-3d.html`)

---

The code is open source at [github.com/woss/woss.io](https://github.com/woss/woss.io). The site runs on a $10/month VPS with SQLite, USearch, and Transformers.js — no cloud services, no API dependencies, no monthly SaaS bills.

*Built with SvelteKit 5, Tailwind CSS v4, SQLite, and a lot of streaming tokens.*
