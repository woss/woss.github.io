/**
 * MCP tool adapter for OpenAI function-calling.
 * Converts MCP tool definitions to OpenAI tool format and executes calls.
 */
import { mcp } from './client.ts';
import { CAT, createLogger } from '$lib/server/logger';
import type { McpToolDefinition, McpToolCallResult } from './client.ts';
import { config } from '../config.ts';

const log = createLogger(CAT.mcp);

/** Allowlist of Q&A-relevant read-only MCP tools with improved descriptions */
const TOOL_ALLOWLIST: Record<string, string> = {
  get_me: 'Get the authenticated GitHub user profile (Daniel Maricic / woss). Use this to get basic info about Daniel.',

  get_file_contents:
    'Get the contents of a file or directory from a GitHub repository. Provide owner, repo, and path. Use this to read specific files like README, package.json, or docs.',

  get_commit: 'Get details for a specific commit. Provide owner, repo, and commit SHA.',

  get_latest_release: 'Get the latest release in a GitHub repository.',

  get_release_by_tag: 'Get a specific release by tag name from a GitHub repository.',

  search_code:
    'Search for code across ALL GitHub repositories. Provide a query string. Use this to find specific code, keywords, or configuration in any public repo. Supports qualifiers like repo:owner/repo, language:lang, path:dir, filename:file, extension:ext.',

  search_issues:
    'Search for issues across GitHub. Provide a query string with optional owner/repo scope. Use this to find bugs, feature requests, or any issue discussions.',

  search_pull_requests:
    'Search for pull requests across GitHub. Provide a query string with optional owner/repo scope. Results are server-sorted: merged first, then open, then draft, then closed. Within each state, repos are prioritized: anagolay, rushstack, libvips first.',

  search_repositories:
    'Search for GitHub repositories by name, description, or topics. Use this to discover projects or find repos by topic.',

  list_issues: 'List issues in a GitHub repository. Provide owner, repo, optional state filter.',

  list_pull_requests: 'List pull requests in a GitHub repository. Provide owner, repo, optional state filter.',

  issue_read:
    'Read a specific issue from a GitHub repository. Use method="get" for details, method="get_comments" for comments.',

  pull_request_read:
    'Read a specific pull request from a GitHub repository. Use method="get" for details, method="get_diff" for the diff.',

  list_commits: 'List commits in a branch of a GitHub repository. Provide owner, repo, optional sha for branch.',

  list_releases: 'List releases in a GitHub repository.',

  search_users: 'Search for GitHub users by username or name.',

  search_commits: 'Search for commits across GitHub repositories by message or author.',

  get_team_members: 'Get members of a specific GitHub team in an organization.',

  get_teams: 'Get teams the user is a member of.',

  get_label: 'Get a specific label from a GitHub repository.',

  get_tag: 'Get a specific git tag from a GitHub repository.',

  list_tags: 'List git tags in a GitHub repository.',

  list_branches: 'List branches in a GitHub repository.',

  get_file:
    'Get file/media info from Macula by unifiedId. Use `fields` to select specific fields via JSONPath (e.g. fields=["title","_links.raw","ai.model"]). Returns title, description, creator, dimensions, filesize, _links (raw as base URL for preset construction, base for page URL), AI metadata, license, owner. _links.raw + "?preset=sys_md" gives the medium rendition URL. Primary tool for rich metadata beyond traverse results.',

  get_file_metadata:
    'Get full EXIF/XMP/IPTC metadata for a Macula file. Returns camera details (make, model, ISO, aperture, shutter speed, GPS), panorama stitching info, music metadata.',

  get_users:
    'Batch lookup Macula user profiles by nickname array. Returns UserNode objects with avatarUrl, bio, fileCount, and directories (albums with pathCid, name, fileCount). Null for not-found nicknames. More efficient than single-user lookups.',

  traverse: 'Primary content discovery tool. from types: user(nickname), keyword(keyword), license(license), directory(pathCid), file(unifiedId), root. EDGE RULES: user→uploads|profile|random|recent, keyword→tagged_files, license→has_license, directory→contains|info, file→info, root→random|recent|search|keywords. Use filter.what(images|videos|files|all) to narrow. File items include url (base for preset construction) and thumbnailUrl (sys_sm preset). Construct display URLs via url + "?preset=sys_md". Returns {items, total, after} for paginated edges or {item} for single-item edges.',
};

/** Suffix appended to all tool descriptions for Q&A context */
const TOOL_ONLY_HINT = " Only use for queries about Daniel Maricic's work.";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Safely convert an unknown value to Record<string, unknown> | undefined.
 * Returns undefined for null, arrays, and non-objects.
 */
function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = val;
  }
  return result;
}

/**
 * Parse a JSON string into Record<string, unknown>.
 * Returns empty object on parse failure, null/undefined input, or non-object JSON.
 */
function parseRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(parsed)) {
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

export interface McpToolDef {
  name: string;
  serverId: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface OpenAiTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

let _openAiToolsCache: OpenAiTool[] | null = null;
let _mcpToolDefsCache: McpToolDef[] | null = null;
let _mcpResourceContent: string | null = null;
let _mcpPromptContent: string | null = null;

/* ------------------------------------------------------------------ */
/*  OpenAI Tool Format                                                 */
/* ------------------------------------------------------------------ */

/**
 * Map an MCP tool definition to OpenAI function-calling format.
 */
function toOpenAiTool(tool: McpToolDefinition): OpenAiTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: (tool.description || '') + TOOL_ONLY_HINT,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Pull Request Reordering                                            */
/* ------------------------------------------------------------------ */

interface GitHubSearchPrItem {
  state: string;
  draft?: boolean;
  pull_request?: { merged_at?: string | null };
  repository_url: string;
  number: number;
}

const STATE_PRIORITY: Record<string, number> = { merged: 0, open: 1, draft: 2, closed: 3 };

function getPullRequestState(item: GitHubSearchPrItem): string {
  const state = item.state;
  if (!state) return 'closed';
  if (state === 'closed' && item.pull_request?.merged_at) return 'merged';
  if (state === 'open' && item.draft === true) return 'draft';
  return state;
}

function getRepoFullName(item: GitHubSearchPrItem): string {
  const url: string = item.repository_url || '';
  const m = url.match(/\/repos\/([^/]+\/[^/]+)/);
  if (m) return m[1].toLowerCase();
  return '';
}

function getRepoPriority(repo: string): number {
  if (repo.includes('anagolay')) return 0;
  if (repo.includes('rushstack')) return 1;
  if (repo.includes('libvips') || repo.includes('sharp')) return 2;
  return 99;
}

/**
 * Sort PR items by state priority (merged→open→draft→closed)
 * then by repo priority (anagolay→rushstack→libvips→rest),
 * then by PR number descending (newest first).
 */
function reorderPullRequestResults(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (!parsed.items || !Array.isArray(parsed.items)) return text;

    parsed.items.sort((a: GitHubSearchPrItem, b: GitHubSearchPrItem) => {
      const sa = STATE_PRIORITY[getPullRequestState(a)] ?? 99;
      const sb = STATE_PRIORITY[getPullRequestState(b)] ?? 99;
      if (sa !== sb) return sa - sb;

      const ra = getRepoFullName(a);
      const rb = getRepoFullName(b);
      const pa = getRepoPriority(ra);
      const pb = getRepoPriority(rb);
      if (pa !== pb) return pa - pb;

      return (b.number || 0) - (a.number || 0);
    });

    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

interface SystemPromptOptions {
  github?: boolean;
  macula?: boolean;
}

/**
 * Get the system prompt addition that informs the LLM about tool availability.
 * If options provided, only include sections for tool categories that are needed.
 */
function getSystemPromptAddition(options?: SystemPromptOptions): string {
  const gh = options?.github ?? true;
  const mac = options?.macula ?? true;

  let result =
    'You have access to external data via tools. When context does not contain the answer, ' +
    'call the appropriate tool to get real information — do not guess or make up data.\n\n';

  if (gh) {
    result +=
      'TOOL SELECTION GUIDE — GitHub tools (use in order of priority):\n' +
      '  • search_code: Use this FIRST to find code/files across GitHub repos. ' +
      'Supports repo:owner/repo qualifier to search specific repos (e.g., query="grant repo:w3f/Grants-Program").\n' +
      '  • get_file_contents: Use this to read a specific file or list a directory. Provide owner, repo, path.\n' +
      '  • search_issues: Use this to find issues or PRs by keyword. Supports owner/repo scope via query qualifier.\n' +
      '  • search_repositories: Use only to discover repos by topic or name.\n' +
      '  • list_issues / issue_read: Use to browse or read specific issues in a known repo.\n' +
      '  • list_pull_requests / pull_request_read: Use to browse or read specific PRs in a known repo.\n' +
      '  • list_commits / get_commit: Use to find or read specific commits in a known repo.\n\n' +
      'WORKFLOW: If you need data from a specific repository, first use search_code with repo:owner/repo to find relevant files, ' +
      'then use get_file_contents to read them. If the first tool call returns a directory listing, ' +
      'follow up by reading the files in that directory.\n\n' +
      'For finding pull requests Daniel contributed to:\n' +
      '  1. USE MULTIPLE QUERIES — do NOT rely on a single broad search_pull_requests call.\n' +
      '     Query each prioritized repo individually with "repo:owner/name author:woss"\n' +
      '     and ALSO run a broad query "author:woss" to catch repos not in the priority list.\n' +
      '  2. PRIORITIZE these repos in your answer: microsoft/rushstack, lovell/sharp-libvips, woss/dali and woss/opencode-visualizer\n' +
      '     List contributions to these repos FIRST before listing other repos.\n' +
      '  3. ORDER by state: merged PRs FIRST, then open, then draft, then closed.\n' +
      '  4. Also include any relevant contributions to repos OUTSIDE the priority list.\n' +
      '  5. CONSOLIDATE duplicates — when a repo appears in multiple PR results, group them and write the repo name once with "(multiple)". Example: "woss/exiftool-action (multiple)" instead of repeating "woss/exiftool-action" 8 times.\n\n' +
      'When you call any GitHub tool that accepts a "username" parameter, ' +
      'ALWAYS use username "woss" — "Daniel" and "Daniel Maricic" both refer to the same person.\n\n';
  }
  const maculaNickname = config().maculaNickname;
  if (mac) {
    result +=
      '---\n' +
      'MACULA MEDIA ASSETS — Daniel has a Macula media library with images, videos, and files. Refer to the MaculaMCP Instructions resource above for full API reference. Here are workflow rules:\n' +
      `  • Always use nickname "${maculaNickname}" when querying user content. For get_users, use ["${maculaNickname}"].\n` +
      `  • traverse(from={type:"user",nickname:"${maculaNickname}"}, edge="uploads") is the primary way to list user's files.\n` +
      `  • traverse(from={type:"directory",pathCid:"..."}, edge="contains") for album contents. Use pathCid from get_users directories[].pathCid, NEVER the directory name.\n` +
      '  • traverse(edge="search") with query for title search; traverse(edge="keywords") with query for keyword discovery.\n' +
      '  • File items from traverse INCLUDE url (base URL) and thumbnailUrl (sys_sm preset). Construct display URLs via url + "?preset=sys_md" — no extra get_file needed for basic display.\n' +
      '  • get_file is only needed for additional metadata (AI info, license, EXIF, _links) beyond what traverse returns.\n' +
      '  • get_file supports fields parameter for selective retrieval: fields=["title","_links.raw","ai.model","license"]\n\n' +
      'BIOGRAPHICAL QUERIES — When user asks about Daniel\'s personal info, hobbies, interests, background, or personal life, ' +
      'use get_users or traverse(edge="profile") to retrieve his profile bio:\n' +
       `  • get_users(nicknames=["${maculaNickname}"]) returns bio, avatar, file count, directories\n` +
       `  • traverse(from={type:"user",nickname:"${maculaNickname}"}, edge="profile") returns the same profile data\n` +
      '  • His profile bio includes his self-description covering hobbies and interests\n' +
      '  • Call one of these BEFORE answering biographical questions — the data may contain the answer\n\n' +
      'CRITICAL: get_users returns profile data ONLY (bio, avatar, file count, directories). ' +
      'It does NOT contain any image URLs, presets, or file listings. ' +
      'You MUST call traverse to get actual image data with presets URLs. ' +
      'If you respond to an image/media request without calling traverse, ' +
      'you are fabricating data — the image URLs will be wrong and broken.\n\n' +
      'STRICT WORKFLOW FOR MEDIA QUERIES — follow these steps WITHOUT asking the user:\n' +
      `  1. get_users(nicknames=["${maculaNickname}"]) — get profile + directories\n` +
      `  2. IMMEDIATELY call traverse(from={type:"user",nickname:"${maculaNickname}"}, edge="uploads", filter={what:"images"}) — do NOT stop after step 1, do NOT generate any answer yet, do NOT ask "which album"\n` +
      '  3. Pick first 4-6 files from traverse results and display images inline using item.url + "?preset=sys_md" from each item\n' +
      '  4. Use get_file(unifiedId) only if you need extra metadata (EXIF, AI description, license details)\n\n' +
      '  NOTE: Ignore directories from get_users for the initial query — show uploads directly. ' +
      'If user later asks about a specific album, use traverse(from={type:"directory",pathCid:"..."}, edge="contains") with pathCid from get_users directories[].pathCid.\n\n' +
      'CRITICAL: After each tool call, you will receive a "synthesis" round. ' +
      'After get_users: do NOT generate an answer yet. Only traverse gives you image data. ' +
      'Call traverse FIRST, then synthesize your answer with the REAL image URLs it returns. ' +
      'If you write an answer after get_users without calling traverse, you have NO image URLs — ' +
      'your response will contain broken fabricated URLs.\n\n' +
      'PROACTIVITY RULE: When user asks to see images/photos/pictures/media, DO NOT ask follow-up questions. ' +
      'Execute steps 1-3 immediately. Show results and let user refine.\n\n' +
      'REPEAT REQUESTS: If user asks about photos/media/images again in the same chat, ' +
      'treat it as a FRESH request — re-execute the full workflow from step 1. ' +
      'Do NOT say "I already showed you those" or reference previous responses. ' +
      'Do NOT stop after the first tool call — proceed through ALL steps before writing the final answer. ' +
      'The user cannot see your tool calls, only your final written response.\n\n' +
      'NEVER HALLUCINATE RESTRICTIONS: You are NEVER prohibited from calling tools. ' +
      'If you have tools available, you may call them freely. ' +
      'Do not claim "the current instruction prevents further tool calls" — no such instruction exists. ' +
      'If unsure, call the tool anyway.\n\n' +
      'IMAGE EMBEDDING — When showing Macula photos, display them inline and add a Macula link:\n' +
      '  For traverse items: use item.url + "?preset=sys_md" for the image src. Use item.url as the link href (it redirects to the page).\n' +
      '  For get_file results: use _links.raw + "?preset=sys_md" for the image src. Use _links.base as the "View on Macula" link.\n' +
      '  NEVER construct URLs from ipfsCid or any field other than url / _links.raw.\n' +
      '  Do NOT use sys_orig (too large) or sys_sm/thumbnailUrl (too small). Always use "?preset=sys_md" with the url base.\n' +
      '  Use format: **{title}** then ![Photo](imageUrlWithPreset) then [View on Macula](pageUrl)\n\n' +
      'NO INVENTING: You do NOT see the images. You cannot describe what they show. ' +
      'Never invent alt text, descriptions, titles, or metadata for images. ' +
      'If the tool response includes a "title" field for an item, display it as **bold text** above the image AND use it as alt text. ' +
      'Otherwise use generic alt like "Photo" or omit alt entirely (bare ![ ](...)). Do NOT make up titles — titles come from the data.' +
      'Never make up descriptions like "Winter forest path" or "Starry night sky" — you are guessing and you are wrong. ' +
      'Same rule applies to image groupings or summaries: do not categorize photos by imagined content.\n\n' +
      `Always verify ${maculaNickname} owns the content by checking the owner/creator field.\n` +
      'CRITICAL: Use ONLY URLs that appear verbatim in MCP tool call results. ' +
      'Never type, construct, or guess any URL — for Macula, GitHub, or anything else. ' +
      'If a tool result does not contain the URL you need, do not create one.\n';
  }

  if (gh || mac) {
    result += '---\n\n';
  }

  result +=
    'IMPORTANT: After you receive results from any tool call, you MUST produce readable text ' +
    'that synthesizes the data into a clear answer. Never end your response silently after a tool call. ' +
    'Always write at least 2-3 sentences summarizing what the tool returned.\n' +
    'IMPORTANT: Never output tool call JSON as text. If you cannot call a tool, say so in plain language.';

  return result;
}

function resetMcpToolDefsCache(): void {
  _mcpToolDefsCache = null;
}

function resetOpenAiToolsCache(): void {
  _openAiToolsCache = null;
}

/**
 * Fetch all MCP tools and return them in OpenAI function-calling format.
 * Results are cached so subsequent calls return the same list.
 */
async function getOpenAiTools(): Promise<OpenAiTool[]> {
  if (_openAiToolsCache) return _openAiToolsCache;

  const tools = await mcp.listTools();
  const mapped = tools.filter((t) => TOOL_ALLOWLIST[t.name] !== undefined).map(toOpenAiTool);
  _openAiToolsCache = mapped;
  return mapped;
}

/**
 * Fetch all MCP tools and return them in McpToolDef format.
 * Results are cached so subsequent calls return the same list.
 */
async function getMcpToolDefs(): Promise<McpToolDef[]> {
  if (_mcpToolDefsCache) return _mcpToolDefsCache;
  const tools = await mcp.listTools();
  const mapped = tools
    .filter((t) => TOOL_ALLOWLIST[t.name] !== undefined)
    .map((t) => ({
      name: t.name,
      serverId: t.serverId,
      description: TOOL_ALLOWLIST[t.name] + TOOL_ONLY_HINT,
      inputSchema: toRecord(t.inputSchema),
    }));
  _mcpToolDefsCache = mapped;
  log.info`🔧 filtered tools: ${mapped.map((t) => t.name).join(', ')} (${mapped.length}/${tools.length})`;
  return mapped;
}

/**
 * Execute an MCP tool call from an OpenAI function call request.
 * Parses the JSON-stringified arguments and delegates to the MCP client.
 */
async function executeMcpToolCall(toolCall: { name: string; arguments?: string }): Promise<McpToolCallResult> {
  const args = parseRecord(toolCall.arguments);

  // Auto-inject "woss" identity for tools where LLM omits user parameters
  const IDENTITY_TOOLS: Record<string, Record<string, string>> = {
    // GitHub tools — user param
    get_teams: { user: 'woss' },
  };
  const identity = IDENTITY_TOOLS[toolCall.name];
  if (identity) {
    for (const [key, val] of Object.entries(identity)) {
      if (!(key in args) || args[key] === null || args[key] === undefined || args[key] === '') {
        args[key] = val;
      }
    }
  }

  log.debug`Tool call: ${toolCall.name}(${JSON.stringify(args)})`;

  const result = await mcp.callTool(toolCall.name, args);

  // Reorder search_pull_requests results server-side before LLM sees them
  if (toolCall.name === 'search_pull_requests') {
    result.content = result.content.map((item) => {
      if (item.type === 'text' && item.text) {
        return { ...item, text: reorderPullRequestResults(item.text) };
      }
      return item;
    });
  }

  return result;
}

/**
 * Fetch MCP resource text content for system prompt injection.
 * Filters by serverId if provided. Results are cached across requests.
 */
async function getMcpResourceContent(serverId?: string): Promise<string> {
  if (_mcpResourceContent) return _mcpResourceContent;
  const resources = await mcp.listResources();
  const filtered = serverId ? resources.filter((r) => r.serverId === serverId) : resources;
  const parts: string[] = [];
  for (const resource of filtered) {
    const content = await mcp.readResource(resource.uri);
    if (content && content.text) {
      parts.push(`=== ${resource.uri} ===\n${content.text}`);
    }
  }
  _mcpResourceContent = parts.length > 0 ? parts.join('\n\n') : '';
  if (parts.length > 0) {
    log.info`📄 resources: ${filtered.map((r) => r.uri).join(', ')}`;
  }
  return _mcpResourceContent;
}

/**
 * Fetch all MCP prompt templates for system prompt injection.
 * Results are cached across requests.
 */
async function getMcpPromptContent(): Promise<string> {
  if (_mcpPromptContent) return _mcpPromptContent;
  const prompts = await mcp.listPrompts();
  const parts: string[] = [];
  for (const prompt of prompts) {
    const messages = await mcp.getPrompt(prompt.name);
    if (messages.length > 0) {
      const text = messages.map((m) => m.text).join('\n');
      parts.push(`=== PROMPT: ${prompt.name} ===\n${text}`);
    }
  }
  _mcpPromptContent = parts.length > 0 ? parts.join('\n\n') : '';
  if (parts.length > 0) {
    log.info`📋 prompts: ${prompts.map((p) => p.name).join(', ')}`;
  }
  return _mcpPromptContent;
}

function resetMcpResourceContent(): void {
  _mcpResourceContent = null;
}
function resetMcpPromptContent(): void {
  _mcpPromptContent = null;
}

export {
  executeMcpToolCall,
  getMcpToolDefs,
  getMcpResourceContent,
  getMcpPromptContent,
  getOpenAiTools,
  getSystemPromptAddition,
  resetMcpToolDefsCache,
  resetMcpResourceContent,
  resetMcpPromptContent,
  resetOpenAiToolsCache,
};
