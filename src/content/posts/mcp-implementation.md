# Building a Public MCP Server: From Zero to Production

## How We Built Macula's Unified Link MCP for AI Agents

*Published: March 2026*

---

## Introduction

The Model Context Protocol (MCP) is rapidly becoming the standard for connecting AI agents to external data sources. When we decided to expose our Unified Link service through MCP, we faced a unique challenge: creating a **public, read-only MCP server** that could serve AI agents without authentication while maintaining production-grade security.

This is the story of how we built it.

## The Problem

We had a public API (`unified-link`) that served metadata about files, users, and keywords. We wanted AI agents to access this data through MCP, but our requirements were specific:

- **Public access** — No authentication required (data is already public)
- **Read-only** — Only safe, non-destructive operations
- **Production-ready** — Rate limiting, input validation, SQL injection protection
- **Scalable** — Should work with multiple server instances
- **Simple** — Minimal dependencies, maintainable code

## Key Design Decisions

### 1. Direct SDK, Not Wrappers

We chose to use `@modelcontextprotocol/sdk` directly instead of wrapper libraries. This gave us:

- Full control over transport behavior
- No unnecessary abstractions
- Direct access to MCP specification features

### 2. Stateless Mode

The most impactful decision was using **stateless mode** for session management.

```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
});
```

**Benefits:**

- No session memory leaks
- Works with any number of server instances (no sticky sessions)
- No Redis needed for session storage
- Restart tolerant
- Simpler code

**Trade-off:** Agents reinitialize after disconnect. For a read-only public service, this is perfectly acceptable.

### 3. Zod for Validation

We used Zod (already in our codebase) for input validation:

```typescript
export const GetFileInputSchema = z.object({
  unifiedId: z
    .string()
    .min(1, 'unifiedId is required')
    .max(64, 'unifiedId must be at most 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'unifiedId must contain only alphanumeric characters'),
});
```

### 4. Defense in Depth

We implemented multiple layers of security:

| Layer | Protection |
|-------|------------|
| **Slow-down** | Progressive delays after 100 requests |
| **Rate limiting** | Hard limit at 200 requests/minute |
| **Input validation** | Zod schemas reject invalid input |
| **Input sanitization** | Remove dangerous characters |
| **SQL injection** | Parameterized queries |
| **Request timeout** | 30 seconds max |
| **Tool annotations** | readOnly hints for agents |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         AI Agent                               │
└─────────────────────────────┬─────────────────────────────────┘
                              │ JSON-RPC
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                        MCP Server                              │
│  ┌────────────────────────────────────────────────────────┐   │
│  │        StreamableHTTPServerTransport (stateless)        │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │          Rate Limiting (slow-down + hard limit)         │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                       McpServer                          │   │
│  │                        10 Tools                          │   │
│  │                       14 Prompts                         │   │
│  │                       1 Resource                         │   │
│  └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                  ┌───────────┴───────────┐                      │
│                  ▼                       ▼                      │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │        Redis         │  │      PostgreSQL      │            │
│  │  (cache + limits)    │  │      (Prisma)        │            │
│  └──────────────────────┘  └──────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

## The 10 Tools

We exposed 10 read-only tools organized by domain:

### Files (5)

| Tool | Input | Description |
|------|-------|-------------|
| `get_file` | `unifiedId` | Full metadata (title, description, creator, links, AI info) |
| `get_file_metadata` | `unifiedId, a?` | EXIF/XMP metadata |
| `get_file_presets` | `unifiedId` | Available renditions |
| `get_file_json_schema` | — | Schema for type-safe code |
| `get_metadata_json_schema` | — | Metadata schema |

### Node (1)

| Tool | Input | Description |
|------|-------|-------------|
| `get_node` | `type (user\|file\|directory), nickname?, unifiedId?, pathCid?` | Single node by type (user profile, file node, directory) |

### Search (2)

| Tool | Input | Description |
|------|-------|-------------|
| `search_keywords` | `search?, page?, limit?` | Search keywords |
| `search` | `query, filter?, limit?, after?` | Full-text search over file titles (pg_trgm fuzzy matching) |

### Navigation (2)

| Tool | Input | Description |
|------|-------|-------------|
| `traverse` | `from, edge, filter?, limit?, after?` | Discover content by navigating relationships (user→uploads, keyword→tagged_files, license→has_license, directory→contains, root→random/recent) |
| (replaces 7 old tools) | | `list_files_by_license`, `list_files_for_ai`, `list_user_files`, `list_random_files`, `list_files_by_keyword`, `get_directory`, `get_directory_files` |

## The 14 Prompts

We built specialized prompts for common agent workflows:

| Prompt | Description |
|--------|-------------|
| `discover_user_content` | Explore a creator's content |
| `content_analysis` | Analyze file metadata and quality |
| `search_discovery` | Find content via keywords |
| `license_discovery` | Find content by license type |
| `content_curation` | Curate content collections |
| `rights_audit` | Audit usage rights |
| `rights_verification` | Verify specific rights |
| `rendition_optimization` | Find optimal file versions |
| `creator_ecosystem` | Explore creator's network |
| `metadata_extraction` | Extract structured metadata |
| `random_exploration` | Discover random content |
| `directory_deep_dive` | Explore directory contents |
| `service_info` | Get service information |
| `data_mining_discovery` | Find AI-friendly content |

## The Resource

| Resource | Description |
|----------|-------------|
| `instructions` | Service usage guidelines for agents |

## Security Implementation

### Input Sanitization

We strip dangerous characters before any processing:

```typescript
const DANGEROUS_CHARS_REGEX = /[<>'";&\\]/g;

export function sanitizeInput(input: string, maxLength = 100): string {
  return input
    .replace(DANGEROUS_CHARS_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
```

### SQL Injection Prevention

All raw SQL uses parameterized queries:

```typescript
// Good
await prismaClient.$queryRawUnsafe<...>('SELECT ... LIMIT $1', limit);

// Bad (never do this)
await prismaClient.$queryRawUnsafe<...>(`SELECT ... LIMIT ${limit}`);
```

### Rate Limiting

Two-layer protection:

```typescript
// Layer 1: Slow-down (progressive delays)
await instance.register(slowDownPlugin, {
  delayAfter: 100,
  delay: '100ms',
  timeWindow: '1 minute',
});

// Layer 2: Hard limit
await instance.register(fastifyRateLimit, {
  max: 200,
  timeWindow: '1 minute',
  redis, // Redis-backed for multi-instance
});
```

## Input Validation Rules

| Field | Constraints |
|-------|-------------|
| `unifiedId` | 1-64 chars, regex `^[a-zA-Z0-9_-]+$` |
| `nickname` | 1-32 chars, regex `^[a-zA-Z0-9_]+$` |
| `pathCid` | 1-200 chars |
| `keyword` / `search` | 1-100 chars (search: min 2) |
| `query` | 2-200 chars |
| `limit` | 1-100 |
| `page` | ≥ 0 or ≥ 1 |
| `after` | Base64url cursor string |
| `edge` | Enum: `uploads`, `tagged_files`, `has_license`, `contains`, `random`, `recent` |
| `from.type` | Enum: `user`, `keyword`, `license`, `directory`, `root` |
| `filter.what` | Enum: `all`, `images`, `videos`, `files` |
| `filter.allowAI` | Boolean |

## Development vs Production

When `isDev` is true:
- Rate limiting disabled
- Slow-down disabled

This allows easy local testing while keeping production secure.

## Results

| Metric | Value |
|--------|-------|
| Tools | 10 |
| Prompts | 14 |
| Resources | 1 |
| Security layers | 6 |
| Code complexity | Low |
| Dependencies | Minimal |
| Scalability | Horizontal |

## Lessons Learned

### What Worked

1. **Stateless mode** — Perfect for public read-only services
2. **Direct SDK usage** — No abstraction overhead
3. **Defense in depth** — Multiple security layers
4. **Graph-shaped API** — Replaced 7 specialized tools with 3 composable ones (traverse, get_node, search), reducing surface area while increasing expressiveness
5. **Zod schemas** — Single source of truth for validation and types

### What We'd Do Differently

1. **Stateless from day one** — We initially used stateful sessions, then switched
2. **Centralized error handling** — Would have saved time on error responses
3. **Tool categories** — Grouping tools would help agent discovery

## Conclusion

Building a public MCP server doesn't require complex authentication or session management. By embracing stateless design, using defense in depth, and leveraging existing tools (Zod, Prisma, Redis), we built a production-ready MCP server that's simple to maintain and scale.

The key insight: **public, read-only MCP servers are fundamentally simpler than authenticated ones**. Don't add complexity you don't need.

---

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Full Source Code](../services/unified-link/src/routes/mcp)

---

*Built with Fastify, TypeScript, Prisma, Redis, and ❤️*
