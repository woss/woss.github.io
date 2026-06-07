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
    'Get file/media info from Macula by unifiedId. Returns title, description, creator, dimensions, AI metadata, license, and media renditions (posters, thumbnails).',

  get_file_metadata:
    'Get full EXIF/XMP/IPTC metadata for a Macula file. Returns camera details (make, model, ISO, aperture, shutter speed, GPS), panorama stitching info, music metadata.',

  get_file_presets: 'Get available renditions for a Macula file (sys_sm, sys_lg, open_graph, etc.).',

  get_file_json_schema: 'Get JSON Schema for Macula file data structure.',

  get_metadata_json_schema: 'Get JSON Schema for Macula metadata structure.',

  get_user: 'Get a Macula user profile by nickname. Returns name, bio, directories, stats.',

  get_node: 'Get a single Macula node (user, file, or directory) by type. Rich return with all metadata inline.',

  search: 'Search Macula files by title. Supports query (string, min 2 chars) and filter (what: images/videos/files, allowAI, nickname). Use for finding specific content by name.',

  search_keywords:
    'Search keywords in Macula for prompt generation or topic discovery. Use this to find available keywords/tags.',

  traverse: 'Graph native traversing of Macula content. EDGE VALIDATION (use only these combinations): from={type:"user",nickname:"woss"} → edge="uploads"|"recent"|"random". from={type:"directory",pathCid:"..."} → edge="contains". from={type:"keyword",keyword:"..."} → edge="tagged_files". Use pathCid from get_user response dirs[].pathCid — NOT directory name. filter: what("images"|"videos"|"files"), allowAI, nickname. Returns items with unifiedId, kind, mimeType, url. Primary tool for listing media.',
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
      'MACULA MEDIA ASSETS — Daniel has a Macula media library with images, videos, and files. Use these tools to discover and display media.\n' +
      `When using Macula tools that accept a "nickname" parameter (get_user) or nested nickname in "from" (traverse), ALWAYS use "${maculaNickname}".\n` +
      `  • get_user(nickname): Start here. Look up ${maculaNickname}'s profile to get directories, stats, and file counts.\n` +
      `  • traverse(edge="uploads"|"recent") for user content: from={type:"user",nickname:"${maculaNickname}"}, filter={what:"images"}.\n` +
      `  • traverse(edge="contains") for directory/album: from={type:"directory",pathCid:"..."} — use pathCid from get_user dirs[].pathCid, NOT directory name.\n` +
      `  • traverse(edge="tagged_files") for keywords: from={type:"keyword",keyword:"..."}. Combine with search_keywords first.\n` +
      '  • search_keywords: Search for available keywords/tags for topic discovery.\n' +
      '  • search: Search Macula files by title. Use for finding specific content by name.\n' +
      '  • get_file(unifiedId): Get detailed info about a specific file including cachedRenditions with image URLs.\n' +
      '  • get_file_metadata(unifiedId): Get EXIF/camera metadata for a file.\n' +
      '  • get_file_presets(unifiedId): Get available renditions for a file.\n' +
      '  • get_node(type, nickname): Get a single node (user/file/directory) by identifier.\n\n' +
      'STRICT WORKFLOW FOR MEDIA QUERIES — follow these steps WITHOUT asking the user:\n' +
      `  1. get_user(nickname="${maculaNickname}") — get profile + directories\n` +
      `  2. IMMEDIATELY call traverse(from={type:"user",nickname:"${maculaNickname}"}, edge="uploads", filter={what:"images"}) — do NOT stop after get_user, do NOT ask which album\n` +
      `  3. Pick first 4-6 files from traverse results and call get_file(unifiedId) for each to get cachedRenditions with image URLs\n` +
      '  4. Display images inline using cachedRenditions[presetName="sys_md"].url + [View on Macula](_links.base)\n' +
      '  NOTE: Ignore dirs from get_user for initial query — show uploads directly. ' +
      'If user later asks about an album, use traverse(from={type:"directory",pathCid:"..."}, edge="contains") — pathCid is the "bafk..." value from get_user dirs[].pathCid, never directory name.\n\n' +
      'PROACTIVITY RULE: When user asks to see images/photos/pictures/media, DO NOT ask follow-up questions. ' +
      'Execute steps 1-4 immediately. Show results and let user refine.\n\n' +
      'IMAGE EMBEDDING — When showing Macula photos, display them inline and add a Macula link:\n' +
      '  Use the EXACT url value from _links.cachedRenditions[].url in the tool response.\n' +
      '  NEVER construct URLs from ipfsCid or any other field — only use cachedRenditions[].url values as-is.\n' +
      '  Each cachedRendition entry: { "presetName": "...", "url": "https://u.macula.link/..." }.\n' +
      '  Find the entry with presetName "sys_md" (preferred for inline display) or "sys_lg" and use its url field as the image source.\n' +
      '  Do NOT use "sys_orig" for inline display — it is the full-size original and too large.\n' +
      '  Do NOT use "thumbnail" or "avatar" — they are too small.\n' +
      '  Below each image, add a link to its Macula page. Use _links.base from the tool response as the href.\n' +
      '  _links.base is the HTML page URL (not _links.raw which serves raw bytes).\n' +
      '  Format:\n' +
      '    ![alt](cachedRenditionUrl)\n' +
      '    [View on Macula](_links.base)\n' +
      '  Example:\n' +
      '    ![Example](https://u.macula.link/8TArWWYSRASQAHgpkAVvlg-7?preset=sys_md)\n' +
      '    [View on Macula](https://macula.link/8TArWWYSRASQAHgpkAVvlg-7)\n\n' +
      `Always verify ${maculaNickname} owns the content by checking the nickname/creator field.\n` +
      'CRITICAL: Use ONLY URLs that appear in MCP tool call results. ' +
      'Never generate, guess, or invent any URL — for Macula, GitHub, or anything else. ' +
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
    // Macula tools — nickname param
    get_user: { nickname: 'woss' },
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
