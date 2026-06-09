Here's the full diff analysis between 32d0991 ("sound and tools") and HEAD ("not working yet"):
Overview
30 files changed, +1484 / -1752 lines (net -268)
Commit lives on gitbutler/workspace, v1, and pr/13 (remote). 5 subsequent commits above it.
Categories

1. 🔴 MCP Architecture — Tool Filtering & System Prompt (HIGH RISK)

- tools.ts: Hardcoded allowlist removed — was 250 lines of curated tool descriptions + workflow instructions. Replaced with TOOL_DESCRIPTION_OVERRIDES (only 5 strategic overrides). No more IDENTITY_TOOLS auto-injection, no more PR reordering logic, no more enforced multi-step media workflows.
- config.ts: New optional tools?: string field on server config
- manager.ts: readResource/getPrompt accept optional serverId for targeting specific servers
- .env.example: GitHub MCP server now has explicit tools allowlist (8 tools instead of all ~25)
- Impact: System prompt no longer instructs LLM to auto-execute workflows. LLM must derive everything from tool descriptions alone. Likely cause of tool-related breakage.

1. Chat Logic Extraction (REFACTOR)

- chat-helpers.ts created (+246 lines), ~800 lines deleted from ask/+server.ts and generate.ts
- Behavioral changes: isRelevant, needsGithubTools, needsMaculaTools now async (call LLM for ambiguous messages instead of returning false)
- Regex: added daniel'?s possessive, added work trigger, removed idiyanale/sensio from Daniel patterns

1. 🟡 Config — Default Base URL Changed

- Ollama port 11434 → LM Studio port 1234
- Switched $env/static/private → $env/dynamic/private
- New: firstRoundMaxSteps (2), synthesisMaxSteps (7), maxRounds (3)
- Breaking if you run Ollama locally without explicit OPENAI_BASE_URL

1. 🟡 OpenAI Provider — Synthesis Now Calls Tools

- Synthesis round: maxSteps=2 with tools (was 0, tool-free)
- buildToolSet wraps execution in try/catch (returns error text instead of crashing)
- Temperature: 0.2 → 0.1
- maxOutputTokens renamed to maxTokens
- 'tool-error' event type removed entirely

1. Schema & DB

- Vector index: vectors.usearch → woss.usearch
- Docker volumes: ./new-data/ → ./data/
- Retries: 3→10 with "retry-on-doom-loop"
- Tool calls store full tool_output + started_at
- RAG: searchChunks now filters by content type (post vs experience)

1. Chat UI

- New +error.svelte (custom 404 for deleted chats)
- Delete de-bounce guards, locked chat SSR hydration
- Webhook integration on delete
- Sidebar: slide transitions, flexbox layout fixes

1. Infrastructure

- dotenv@17.4.2 added
- WEB_ORIGIN → ORIGIN (SvelteKit standard)
- LOG_LEVEL env var for runtime log config
  Most likely suspects for breakage (ranked):

1. MCP system prompt stripped — LLM no longer told how to use tools in multi-step workflows
2. Synthesis round now calls tools — can interfere if synthesis corrupts state
3. isRelevant/needsXxxTools async — ambiguous queries now make LLM calls instead of fast-failing
4. Base URL changed — if using Ollama without explicit config
5. Tool error handling changed — errors return as text to model instead of crashing stream
   What specifically isn't working? Chat streaming, MCP tool calls, relevance detection, or something else?
