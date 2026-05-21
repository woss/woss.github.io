---
published: true
---

# Making Content Accessible to AI: How Macula's MCP Works

## Connecting AI Agents to Creative Content

_Published: March 2026_

---

## The Challenge of AI Content Discovery

Imagine you're an AI agent helping someone find the perfect image for their project. You know what they need conceptually — a sunset over mountain peaks, a minimalist product shot, a vintage photograph of a city street — but accessing millions of files to understand what's available? That's a different problem entirely.

This is the challenge we solved with Macula's Model Context Protocol (MCP) implementation.

## What is MCP?

MCP (Model Context Protocol) is rapidly becoming the standard way for AI agents to connect to external data sources. Think of it as a universal adapter — a common language that AI agents can use to query databases, file systems, and services without custom integration work for each one.

When an AI agent connects to a service with MCP support, it gains access to a predefined set of **tools** (actions it can perform), **prompts** (pre-built workflows), and **resources** (documentation and context).

## How Macula's MCP Works

### The Architecture

When an AI agent connects to Macula's MCP server, it establishes a connection to our public API. From there, it can:

1. **Query our database** of published content
2. **Search by keywords** to find relevant files
3. **Access user profiles** and their public collections
4. **Get metadata** including AI generation information, licensing details, and technical specifications
5. **Discover content** through random exploration or curated suggestions

### The 10 Tools

We built 10 specialized tools organized by domain:

**File Tools**

- Get detailed information about any published file
- Retrieve technical metadata (EXIF, XMP, IPTC)
- List available renditions and presets
- Get JSON schemas for type-safe code generation

**Node Access**

- Retrieve a single node (user, file, or directory) by type with all metadata inline

**Search**

- Full-text fuzzy search across file titles and keywords using similarity matching
- Search our keyword taxonomy

**Content Navigation**

- Traverse relationships: navigate from users, keywords, licenses, or directories along graph edges (uploads, tagged_files, has_license, contains) to discover related content
- Random content discovery and recent content listing via root node

### The 14 Prompts

Beyond individual tools, we built pre-configured prompts for common workflows:

**Discovery Flows**

- `discover_user_content` — Explore a creator's full portfolio
- `random_exploration` — Find inspiration through random content
- `search_discovery` — Search by keywords to find relevant content

**Analysis Flows**

- `content_analysis` — Analyze file metadata and quality
- `metadata_extraction` — Extract structured data for processing

**Rights & Licensing**

- `license_discovery` — Find content by license type
- `rights_audit` — Audit usage rights across a collection
- `rights_verification` — Verify specific rights for a use case
- `data_mining_discovery` — Find content permitted for AI training

**Optimization**

- `rendition_optimization` — Find the best version for a specific use (web, print, social)

## Real-World Use Cases

### Use Case 1: Content Discovery for a Project

An AI agent working on a blog post about sustainable architecture could:

1. Use `search` to fuzzy-find files matching "sustainable architecture" across titles and keywords
2. Use `get_file` or `get_node` to examine specific candidates
3. Use `traverse` with `from: { type: "license", license: "Attribution (CC BY)" }` and `edge: "has_license"` to find only CC-BY images
4. Use `get_file_presets` to find the right resolution for web display

### Use Case 2: Building a Content Dataset

A researcher building a training dataset could:

1. Use `traverse` with `filter: { allowAI: true }` to find content permitted for AI training
2. Use `traverse` with `from: { type: "license", license: "..." }` and `edge: "has_license"` to filter by specific licenses
3. Use `get_file_metadata` to extract technical specifications
4. Page through results using cursor-based pagination via the `after` parameter

### Use Case 3: Creator Research

An agent analyzing creative trends could:

1. Use `get_node` with `type: "user"` to access a creator's profile
2. Use `traverse` with `from: { type: "user", nickname: "..." }` and `edge: "uploads"` to browse their published files
3. Use `traverse` with `from: { type: "directory", pathCid: "..." }` and `edge: "contains"` to explore specific directories
4. Use `creator_ecosystem` prompt to find related creators

### Use Case 4: AI-Powered Photographer Portfolio

Sarah is a professional landscape photographer. She publishes her best work on Macula with clear licensing — some images are CC-BY for maximum reach, others are All Rights Reserved for commercial licensing. She has AI data mining enabled on select images to allow AI model training while protecting her commercial work.

She connects Manus AI to Macula's MCP server, and here's what happens:

**Morning: Reviewing Her Published Work**

Sarah asks Manus to "Show me my recently published travel photos and their details." Manus:

1. Uses `get_node` with `type: "user"` to access Sarah's profile
2. Uses `traverse` with `from: { type: "user", nickname: "sarah" }` and `edge: "uploads"` to see her published images
3. Uses `get_file` to get detailed metadata for specific images
4. Presents her with a summary of her portfolio

**Midday: Preparing a Client Presentation**

A client needs a photographer for a sustainable architecture magazine. Sarah asks Manus to "Prepare a portfolio of my architectural and nature photography, filtered by CC-BY license." Manus:

1. Uses `traverse` with `from: { type: "user", nickname: "sarah" }`, `edge: "uploads"`, and `filter: { what: "images" }`
2. Uses `traverse` with `from: { type: "license", license: "Attribution (CC BY)" }` and `edge: "has_license"` to filter by CC-BY
3. Uses `get_file_metadata` to get technical specs for each image
4. Compiles a presentation-ready summary with image links, dimensions, and license info

**Afternoon: AI Agent Builds a Feature Page**

A travel blog wants to feature Sarah's Iceland photography. The blog's AI agent (connected to Macula via MCP):

1. Uses `traverse` with `from: { type: "keyword", keyword: "iceland" }` and `edge: "tagged_files"`
2. Uses `get_file` to examine candidates and their details
3. Uses `get_file_presets` to grab the right image sizes
4. Generates an article draft with properly attributed images
5. Includes correct license links and photographer credit automatically

Sarah gets attribution. The blog gets content. Everyone wins.

**Managing AI Data Mining Permissions**

Sarah wants to see which of her images are enabled for AI training. Manus:

1. Uses `traverse` with `filter: { allowAI: true }` to see content permitted for AI training
2. Uses `search` to find specific files and review their data mining settings
3. Helps Sarah decide which additional images to enable for data mining

**The Key Benefit**

Sarah doesn't need to manually update her portfolio across multiple platforms. Macula is her single source of truth:

- **Images** are hosted with full metadata and licensing
- **MCP access** lets AI agents read her work with correct attribution
- **Automatic updates** — when she publishes new work, AI agents see it immediately
- **Rights protection** — every image has clear license and copyright info baked in

Tools like Manus AI, Lovable, Cursor, and any other MCP-connected agent can now access her work properly — not by scraping websites or guessing licensing, but through structured, permissioned access that respects her choices.

## Security & Performance

### Public by Design

All MCP-accessible content is public. There's no authentication required because the data is already meant to be accessible. This simplifies the architecture and removes the overhead of managing credentials for AI agents.

### Rate Limiting

We implement intelligent rate limiting to ensure fair access:

- **Slow-down layer**: Progressive delays after 100 requests prevent abuse
- **Hard limit**: 200 requests per minute maximum

### Input Validation

Every request is validated and sanitized:

- String inputs are validated against strict patterns
- Length limits prevent oversized requests
- Dangerous characters are stripped

## Developer Experience

For developers building AI-powered applications:

```javascript
// Example: Finding CC-licensed images
const response = await mcpClient.callTool('traverse', {
  from: { type: 'license', license: 'Attribution (CC BY)' },
  edge: 'has_license',
  limit: 10,
});

// Example: Getting file metadata
const fileData = await mcpClient.callTool('get_file', {
  unifiedId: 'abc123xyz',
});

// Example: Finding images tagged with "iceland" via keyword traversal
const response = await mcpClient.callTool('traverse', {
  from: { type: 'keyword', keyword: 'iceland' },
  edge: 'tagged_files',
  filter: { what: 'images' },
  limit: 20,
});

// Example: Full-text search across file titles
const results = await mcpClient.callTool('search', {
  query: 'sustainable architecture',
  limit: 10,
});

// Example: Getting a single node by type
const userNode = await mcpClient.callTool('get_node', {
  type: 'user',
  nickname: 'sarah',
});
```

The MCP interface abstracts away our internal implementation. You don't need to understand our database schema, API versioning, or caching strategy. The tools are designed to be intuitive and self-documenting.

## Complete Reference

### All 10 Tools

#### File Tools (5)

| Tool                       | Description                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `get_file`                 | Get file information by unifiedId — title, description, creator, links, assets, presets, size, copyright info, AI info |
| `get_file_metadata`        | Get full EXIF/XMP/IPTC metadata. Optional `a` parameter for specific metadata fields                                   |
| `get_file_presets`         | Get available renditions (sys_sm, sys_lg, open_graph, etc.) with size and MIME info                                    |
| `get_file_json_schema`     | Get the JSON Schema for the get_file tool output                                                                       |
| `get_metadata_json_schema` | Get the JSON Schema for the metadata tool output                                                                       |

#### Node Tools (1)

| Tool       | Description                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_node` | Get a single node (user, file, or directory) by type. For user: profile with avatarUrl, bio, fileCount. For file: full FileNode with title, owner, license, keywords, directory info, url. For directory: pathCid, name, fileCount |

#### Search Tools (2)

| Tool              | Description                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_keywords` | Search the keyword taxonomy                                                                                                                        |
| `search`          | Full-text search over file titles using fuzzy matching. Returns ranked FileNode results with rich metadata. Supports cursor pagination via `after` |

#### Navigation Tools (1)

| Tool       | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `traverse` | Discover content by navigating relationships. Start from a node type (user, keyword, license, directory, root) and traverse an edge (uploads, tagged_files, has_license, contains, random, recent). Use `filter.what` (images/videos/files/all), `filter.allowAI`, and `filter.nickname` to narrow results. Returns rich FileNode objects with title, owner, keywords, license, url — use `after` cursor for pagination |

#### Removed Tools (replaced by traverse)

| Old Tool                | Replaced By                                               |
| ----------------------- | --------------------------------------------------------- |
| `list_files_by_license` | `traverse(from={type:"license"...}, edge="has_license")`  |
| `list_files_for_ai`     | `traverse(filter={allowAI:true})`                         |
| `list_user_files`       | `traverse(from={type:"user"...}, edge="uploads")`         |
| `list_random_files`     | `traverse(from={type:"root"}, edge="random")`             |
| `list_files_by_keyword` | `traverse(from={type:"keyword"...}, edge="tagged_files")` |
| `get_directory`         | `get_node(type="directory")`                              |
| `get_directory_files`   | `traverse(from={type:"directory"...}, edge="contains")`   |

### All 14 Prompts

| Prompt                   | Description                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| `discover_user_content`  | Explore a creator's full portfolio and content library                    |
| `content_analysis`       | Analyze file metadata, quality, and technical specifications              |
| `search_discovery`       | Search for content using keywords and filters                             |
| `license_discovery`      | Find content by license type (CC BY, CC BY-SA, All Rights Reserved, etc.) |
| `content_curation`       | Curate content collections based on themes or criteria                    |
| `rights_audit`           | Audit usage rights and permissions across a collection                    |
| `rights_verification`    | Verify specific rights for a particular use case                          |
| `rendition_optimization` | Find the optimal file version for web, social, print, or API use          |
| `creator_ecosystem`      | Explore a creator's profile, directories, and related creators            |
| `metadata_extraction`    | Extract and analyze file metadata in structured format                    |
| `random_exploration`     | Discover content through random exploration                               |
| `directory_deep_dive`    | Explore user directory structures and organization                        |
| `service_info`           | Get information about the Macula service and its capabilities             |
| `data_mining_discovery`  | Find content permitted for AI training and data mining                    |

### Resources (1)

| Resource       | Description                                              |
| -------------- | -------------------------------------------------------- |
| `instructions` | Service documentation and usage guidelines for AI agents |

---

All tools are read-only. You can query and analyze, but not modify data. This keeps the system safe and predictable.

### Works With

Any AI agent or platform that supports MCP:

- **Manus AI** — Full AI agent for complex workflows
- **Lovable** — Build apps with AI assistance
- **Cursor** — AI-powered code editor
- **Claude Desktop** — Anthropic's MCP integration
- **Custom agents** — Build your own with the SDK

## The Ecosystem Advantage

When photographers host on Macula, their work becomes part of a growing ecosystem:

- **For creators**: One place to publish, with licensing and copyright built-in
- **For AI agents**: Standardized access to millions of files with correct attribution
- **For everyone**: Better licensing compliance, less copyright confusion, more fair use of creative work

## Getting Started

1. **Connect to our MCP server** at `https://u.macula.link/mcp`
2. **Explore available tools** — the server will describe what it can do
3. **Try a prompt** — start with `discover_user_content` or `random_exploration`
4. **Build your workflow** — chain tools together for complex tasks

## Looking Forward

As AI agents become more capable, the ability to discover and reason about creative content becomes increasingly valuable. MCP provides the standardized interface that makes this possible.

We're continuing to expand our toolset based on real usage patterns. If you're building AI-powered content applications, we'd love to hear what you'd like to see.

---

_For technical details on our MCP implementation, see [Building a Public MCP Server: From Zero to Production](./mcp-implementation.md)._
