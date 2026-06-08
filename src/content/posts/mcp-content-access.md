# Content Graphs for AI: Discovering Creative Work Through Connections

## How AI Agents Navigate Creative Content Like Walking Through a Gallery

_Published: March 2026_

---

## The Gallery

Imagine a photographer's gallery. Inside are themed rooms — "Landscapes," "Portraits," "Street Photography" — each room a directory containing works. Along the walls, exhibits carry tags: "iceland," "black and white," "golden hour." At the entrance, artist profiles display biographies and portfolios.

An AI agent walks this gallery not by memorizing a floor plan, but by following relationships. It moves from a tag to all photos bearing that tag. From a photo to the artist who made it. From the artist to their other albums. From a license to all works under that license.

Each step reveals something new. Each connection leads somewhere meaningful.

This is the content graph.

## What Makes a Content Graph?

A content graph isn't a list of files or a database table. It's a web of relationships. Everything connects to everything else through meaningful edges.

- **Rooms** are directories. They contain collections of works grouped by theme, project, or purpose. Walk into a room and you see what's inside.
- **Tags** are keywords. They connect works across different rooms. A photo tagged "iceland" in the Landscapes room connects to other iceland-tagged works anywhere in the gallery.
- **Artists** are users. They create the works and organize their rooms. Each artist has a profile and a collection of albums.
- **Exploring** is traversal. You walk from one node (a room, a tag, an artist) to another along a relationship. Each step is guided by the connections that exist.

This graph structure is natural for AI agents because it mirrors how humans explore: by association, not by address. You don't need to know that image "abc123" is at URL "/api/v2/files/abc123" — you ask "what's tagged with iceland" and walk from there.

## From Many Tools to One Walk

Early AI-to-content interfaces gave agents many small, rigid tools: one for searching, one for user profiles, one for keyword lookups, one for license filtering. Each tool required the agent to know exactly which one to call. The agent had to understand an API surface, not just a domain.

The content graph simplifies this dramatically.

- **Before**: a separate tool for every question ("show me this room," "find me this tag," "who is this artist," "what's in this directory").
- **Now**: one exploration tool that moves between any connected points in the graph. The agent describes where to start and which relationship to follow. The tool does the rest.

Three leaf operations handle terminal data — when you've arrived at a destination and need the details:

- **File details**: comprehensive metadata for a specific work (title, creator, license, assets, AI info)
- **Technical metadata**: EXIF, XMP, IPTC data for in-depth technical analysis
- **User profiles**: batch lookup of creator information

The exploration tool supports 60 possible from→edge pairs — combinations of starting points and relationships to follow. Of those, 14 return data directly (the rest are invalid combinations that return empty results, guiding agents toward valid paths).

This consolidation means agents spend less time choosing tools and more time exploring. The interface shrinks from many rigid endpoints to one flexible question: "Where do you want to start, and what do you want to follow?"

## Three Real-World Walks

### Walk 1: Building a Mood Board

A designer needs images for an article on sustainable architecture. An AI agent helps find them.

1. **Start**: The agent performs a full-text search across all content for "sustainable architecture." The graph returns files whose titles or descriptions match.
2. **Follow**: From the results, the agent follows the CC-BY license connection to filter only images that can be freely used with attribution.
3. **Inspect**: For promising candidates, the agent reads file details — title, creator, dimensions, license — to confirm suitability.
4. **Navigate**: From a creator whose work fits perfectly, the agent walks to their full uploads to find more images by the same photographer.

The designer gets a curated mood board in one continuous exploration, not a series of disconnected API calls.

### Walk 2: Researching Creative Trends

An agent analyzes what creators are making to understand emerging trends.

1. **Start**: The agent looks up a creator's profile and their public album list — discovering which albums exist before exploring them.
2. **Navigate**: From each album (room), the agent explores what's inside, viewing thumbnails and titles.
3. **Filter**: Within results, the agent narrows to images only, or further to images permitted for AI training — useful for understanding what data might be available for model development.
4. **Compare**: The agent repeats this across multiple creators, building a comparative view of their portfolios and styles.

This walks through the creator graph naturally: artist → albums → works → filtered views.

### Walk 3: Building a Feature Page with Attribution

Sarah is a professional landscape photographer. She publishes her best work on Macula with clear licensing — some images are CC-BY for maximum reach, others are All Rights Reserved for commercial licensing. She has AI data mining enabled on select images to allow AI model training while protecting her commercial work.

She connects Manus AI to Macula's MCP server, and here's what happens:

**Morning: Reviewing Her Published Work**

Sarah asks Manus to "Show me my recently published travel photos and their details." Manus:

1. Looks up Sarah's profile and account details
2. Walks through her published images
3. Inspects detailed metadata for specific images
4. Presents her with a summary of her portfolio

**Midday: Preparing a Client Presentation**

A client needs a photographer for a sustainable architecture magazine. Sarah asks Manus to "Prepare a portfolio of my architectural and nature photography, filtered by CC-BY license." Manus:

1. Explores Sarah's collection of uploaded images
2. Follows the CC-BY license connection to filter only freely-licensed work
3. Reads technical specifications for qualifying images
4. Compiles a presentation-ready summary with image links, dimensions, and license info

**Afternoon: AI Agent Builds a Feature Page**

A travel blog wants to feature Sarah's Iceland photography. The blog's AI agent (connected to Macula via MCP):

1. Walks from the keyword "iceland" to tagged files
2. Inspects candidates and their details
3. Checks available renditions for the right image sizes
4. Generates an article draft with properly attributed images
5. Includes correct license links and photographer credit automatically

Sarah gets attribution. The blog gets content. Everyone wins.

**Managing AI Data Mining Permissions**

Sarah wants to see which of her images are enabled for AI training. Manus:

1. Filters content by AI training permission to find what's enabled
2. Searches for specific files and reviews their data mining settings
3. Helps Sarah decide which additional images to enable

**The Key Benefit**

Sarah doesn't need to manually update her portfolio across multiple platforms. Macula is her single source of truth:

- **Images** are hosted with full metadata and licensing
- **MCP access** lets AI agents read her work with correct attribution
- **Automatic updates** — when she publishes new work, AI agents see it immediately
- **Rights protection** — every image has clear license and copyright info baked in

Tools like Manus AI, Lovable, Cursor, and any other MCP-connected agent can now access her work properly — not by scraping websites or guessing licensing, but through structured, permissioned access that respects her choices.

## Why Graph Walks > REST Calls

Content graphs fundamentally change how agents interact with data. Compare a graph walk to traditional REST:

|                  | Graph Walk                       | REST                     |
| ---------------- | -------------------------------- | ------------------------ |
| **Mental model** | Nodes and relationships          | Endpoints and URLs       |
| **Discovery**    | Describe what you want           | Know the URL patterns    |
| **Round trips**  | 1-2 calls                        | 3+ sequential requests   |
| **Versioning**   | Edge definitions evolve          | New endpoint versions    |
| **Agent fit**    | Natural (entity→relation→entity) | Translation layer needed |

With REST, an agent fetching all CC-BY images by a specific user needs: (1) look up user ID, (2) query user's files, (3) filter by license server-side or client-side. With a graph walk, the agent starts at the user, follows the license edge, and arrives at the result in one conceptual step.

## Content Graph in Practice

Mapping the metaphor back to MCP tools: the `traverse` tool is the exploration walk. `get_file` and `get_file_metadata` are the leaf operations for inspecting what you find. `get_users` is batch profile lookup.

For developers building AI-powered applications:

```javascript
// Example: Finding CC-licensed images via traverse
const response = await mcpClient.callTool('traverse', {
  from: { type: 'license', license: 'Attribution (CC BY)' },
  edge: 'has_license',
  limit: 10,
});

// Example: Getting file metadata with selective fields
const fileData = await mcpClient.callTool('get_file', {
  unifiedId: 'abc123xyz',
  fields: ['title', 'creator', 'license'],
});

// Example: Finding images tagged with "iceland" via keyword traversal
const response = await mcpClient.callTool('traverse', {
  from: { type: 'keyword', keyword: 'iceland' },
  edge: 'tagged_files',
  filter: { what: 'images' },
  limit: 20,
});

// Example: Full-text search across file titles
const results = await mcpClient.callTool('traverse', {
  from: { type: 'root' },
  edge: 'search',
  query: 'sustainable architecture',
  limit: 10,
});

// Example: Batch user profile lookup
const users = await mcpClient.callTool('get_users', {
  nicknames: ['sarah', 'john', 'alex'],
});

// Example: Directory traversal including images
const directoryContents = await mcpClient.callTool('traverse', {
  from: { type: 'directory', pathCid: 'QmExampleDirectory' },
  edge: 'contains',
  limit: 20,
});

// Example: Filter by content type within a directory
const onlyImages = await mcpClient.callTool('traverse', {
  from: { type: 'directory', pathCid: 'QmExampleDirectory' },
  edge: 'contains',
  filter: { what: 'images' },
  limit: 20,
});

// Example: Random discovery across all content
const randomFiles = await mcpClient.callTool('traverse', {
  from: { type: 'root' },
  edge: 'random',
  limit: 5,
});
```

The MCP interface abstracts away our internal implementation. You don't need to understand our database schema, API versioning, or caching strategy. The tools are designed to be intuitive and self-documenting.

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

## Complete Reference

_These tool names map to the content graph operations described above._

### All 4 Tools

| Tool                | Description                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `traverse`          | Universal discovery — navigate relationships across 6 from types × 10 edges. Supports full-text search, keyword lookup, user profiles, file/directory info, and all previous specialized operations. Images included in all traversal results (`contains` and `tagged_files` follow rendition chains). |
| `get_file`          | Get file information by unifiedId — title, description, creator, links, assets, size, copyright info, AI info. Optional `fields` param for selective retrieval.                                                                                                                                        |
| `get_file_metadata` | Get full EXIF/XMP/IPTC metadata. Optional `a` parameter for specific metadata fields.                                                                                                                                                                                                                  |
| `get_users`         | Batch user profile lookup. Accepts 1-100 nicknames, returns array of UserNode or null for not-found.                                                                                                                                                                                                   |

#### Replaced Tools

| Old Tool                      | Replacement                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `get_file_presets`            | `get_file(fields: ['presets'])`                                                                |
| `get_file_json_schema`        | Removed — schema exposed via tool metadata                                                     |
| `get_metadata_json_schema`    | Removed — schema exposed via tool metadata                                                     |
| `get_node(type: 'file')`      | `traverse(edge: 'info', from: { type: 'file', unifiedId })`                                    |
| `get_node(type: 'user')`      | `traverse(edge: 'profile', from: { type: 'user', nickname })` or `get_users(nicknames: [...])` |
| `get_node(type: 'directory')` | `traverse(edge: 'info', from: { type: 'directory', pathCid })`                                 |
| `get_user(nickname)`          | `get_users(nicknames: [nickname])`                                                             |
| `search(query)`               | `traverse(from: { type: 'root' }, edge: 'search', query)`                                      |
| `search_keywords(search)`     | `traverse(from: { type: 'root' }, edge: 'keywords', query)`                                    |
| `list_files_by_license`       | `traverse(from: { type: 'license', license }, edge: 'has_license')`                            |
| `list_files_for_ai`           | `traverse(filter: { allowAI: true })`                                                          |
| `list_user_files`             | `traverse(from: { type: 'user', nickname }, edge: 'uploads')`                                  |
| `list_random_files`           | `traverse(from: { type: 'root' }, edge: 'random')`                                             |
| `list_files_by_keyword`       | `traverse(from: { type: 'keyword', keyword }, edge: 'tagged_files')`                           |
| `get_directory`               | `traverse(edge: 'info', from: { type: 'directory', pathCid })`                                 |
| `get_directory_files`         | `traverse(from: { type: 'directory', pathCid }, edge: 'contains')`                             |

### All 4 Prompts

| Prompt              | Description                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `browse_user`       | Explore a creator's profile, directories, and published files via user → directory → file navigation |
| `display_media`     | Display files (images, video, audio) in markdown with optimal renditions and presets                 |
| `explore_directory` | Deep-dive into a directory's structure, file inventory, and organization patterns                    |
| `inspect_metadata`  | Analyze file metadata — EXIF/XMP/IPTC, AI generation info, licensing, and technical specs            |

### Resources (2)

| Resource URI            | Description                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `instructions`          | Service documentation and usage guidelines for AI agents                                                            |
| `/.well-known/mcp.json` | Auto-discovery metadata — MCP clients find our server at `https://u.macula.link/.well-known/mcp.json` automatically |

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

1. **Auto-discover the server** — MCP-compatible clients find our auto-discovery metadata at `https://u.macula.link/.well-known/mcp.json` automatically
2. **Connect to our MCP server** at `https://u.macula.link/mcp`
3. **Explore available tools** — the server will describe what it can do
4. **Try a prompt** — start with `browse_user` or `random_exploration`
5. **Build your workflow** — chain tools together for complex tasks

## Looking Forward

As AI agents become more capable, the ability to discover and reason about creative content becomes increasingly valuable. MCP provides the standardized interface that makes this possible.

We're continuing to expand our toolset based on real usage patterns. If you're building AI-powered content applications, we'd love to hear what you'd like to see.

---

_For technical details on our MCP implementation, see [Building a Public MCP Server: From Zero to Production](./mcp-implementation.md)._
