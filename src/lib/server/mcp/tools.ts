/**
 * MCP tool adapter for OpenAI function-calling.
 * Converts MCP tool definitions to OpenAI tool format and executes calls.
 */
import { mcp } from './client.ts';
import { CAT, createLogger } from '$lib/server/logger';
import type { McpToolDefinition, McpToolCallResult } from './client.ts';
import { config } from '../config.ts';

const log = createLogger(CAT.mcp);

/** Tools explicitly blocked — write ops, dangerous actions, cross-repo search */
const TOOL_DENY_SET = new Set([
  'create_or_update_file', 'delete_file', 'push_files',
  'create_repository', 'fork_repository',
  'create_pull_request', 'merge_pull_request', 'update_pull_request',
  'pull_request_review_write', 'sub_issue_write', 'issue_write',
  'add_issue_comment', 'add_reply_to_pull_request_comment',
  'add_comment_to_pending_review', 'create_branch',
  'update_pull_request_branch', 'request_copilot_review',
  'cross_repo_search',
  'apply_refactor', 'build_or_update_graph', 'run_postprocess',
  'generate_wiki',
]);

/** Description overrides for tools needing critical LLM usage hints */
const TOOL_DESCRIPTION_OVERRIDES: Record<string, string> = {
  traverse: 'Primary content discovery tool. from types: user(nickname), keyword(keyword), license(license), directory(pathCid), file(unifiedId), root. EDGE RULES: user→uploads|profile|random|recent, keyword→tagged_files, license→has_license, directory→contains|info, file→info, root→random|recent|search|keywords. Use filter.what(images|videos|files|all) to narrow. File items include url (base for preset construction) and thumbnailUrl (sys_sm preset). Construct display URLs via url + "?preset=sys_md". Returns {items, total, after} for paginated edges or {item} for single-item edges. CRITICAL: directory pathCid MUST come from get_users directories[].pathCid. Fabricated CIDs return 0 items.',
  get_users: 'Batch lookup Macula user profiles by nickname array. Returns UserNode with avatarUrl, bio, fileCount, and directories (albums with pathCid, name, fileCount). Null for not-found nicknames. Use this to get REAL directory pathCids before calling traverse(directory→contains).',
  search_pull_requests: 'Search for pull requests across GitHub. Provide a query string with optional owner/repo scope. Results are server-sorted: merged first, then open, then draft, then closed. Within each state, repos are prioritized: anagolay, rushstack, libvips first.',
  get_file: 'Get file/media info from Macula by unifiedId. Use `fields` to select specific fields via JSONPath (e.g. fields=["title","_links.raw","ai.model"]). Returns title, description, creator, dimensions, filesize, _links (raw as base URL for preset construction, base for page URL), AI metadata, license, owner. _links.raw + "?preset=sys_md" gives the medium rendition URL. Primary tool for rich metadata beyond traverse results.',
  get_file_metadata: 'Get full EXIF/XMP/IPTC metadata for a Macula file. Returns camera details (make, model, ISO, aperture, shutter speed, GPS), panorama stitching info, music metadata.',
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
 * Description must include TOOL_ONLY_HINT before calling — this function does not add it.
 */
function toOpenAiTool(tool: McpToolDefinition): OpenAiTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
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
      'GITHUB — Daniel Maricic (woss). Tool priority:\n' +
      '  1. search_code (with repo:owner/repo qualifier) — find files/issues first.\n' +
      '  2. get_file_contents — read specific files by owner+repo+path.\n' +
      '  3. search_issues — find issues/PRs by keyword.\n' +
      '  4. list_issues / issue_read — browse known repos.\n' +
      '  5. list_pull_requests / pull_request_read — browse known PRs.\n' +
      '  6. list_commits / get_commit — find commits.\n' +
      '  7. search_repositories — discover repos (last resort).\n\n' +
      'PR SEARCH (Daniel\'s contributions):\n' +
      '  • Run MULTIPLE queries: each prioritized repo with "repo:owner/name author:woss"\n' +
      '    PLUS broad "author:woss" for repos outside list.\n' +
      '  • Answer order: merged FIRST, then open, draft, closed.\n' +
      '  • Priority: microsoft/rushstack, lovell/sharp-libvips, woss/dali, woss/opencode-visualizer.\n' +
      '  • Consolidate dupes: "repo (multiple)" for >1 PR in same repo.\n\n' +
      'All GitHub tools: use username "woss" (not "Daniel" or "Daniel Maricic").\n\n';
  }
  const maculaNickname = config().maculaNickname;
  if (mac) {
    result +=
      '---\n' +
      'MACULA — Daniel\'s media library. Rules:\n' +
      `  • Profile + directories: get_users(["${maculaNickname}"]). Get REAL pathCid from directories[].pathCid.\n` +
      `  • List images: traverse(user→uploads, filter={what:"images"}).\n` +
      `  • Album contents: traverse(directory→contains). REQUIRES pathCid from get_users. Fabricated pathCids return 0 items — ALWAYS call get_users FIRST.\n` +
      '  • Title search: traverse(search, query="..."); keyword discovery: traverse(keywords, query="...").\n' +
      '  • Display images: item.url + "?preset=sys_md" for src (not sys_orig or sys_sm). item.url for page link.\n' +
      '  • Extra metadata (EXIF, AI, _links): get_file(unifiedId).\n' +
      '  • Biographical info: get_users or user→profile edge — bio in response.\n\n' +
      'MEDIA QUERY WORKFLOW (immutable):\n' +
      `  1. get_users(["${maculaNickname}"]) → profile + directories (get pathCids).\n` +
      '  2. traverse(user→uploads, filter=images) or traverse(directory→contains) with pathCid from step 1.\n' +
      '  3. Display 4-6 images inline with sys_md preset.\n' +
      '  NEVER skip step 1. NEVER fabricate pathCids. After get_users, do NOT answer — call traverse FIRST.\n\n' +
      'IMAGE RULES:\n' +
      '  • Format: **{title}** (from data, never invented) then ![Photo](url?preset=sys_md) then [View on Macula](url).\n' +
      '  • Repeat requests = fresh workflow from step 1. Never say "already showed you."\n' +
      '  • When tools available, call them freely. Treat empty traverse results as signal to re-check tools.\n';
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
  const mapped = tools
    .filter((t) => !TOOL_DENY_SET.has(t.name))
    .map((t) => toOpenAiTool({
      name: t.name,
      serverId: t.serverId,
      description: (TOOL_DESCRIPTION_OVERRIDES[t.name] ?? t.description ?? '') + TOOL_ONLY_HINT,
      inputSchema: toRecord(t.inputSchema),
    }));
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
    .filter((t) => !TOOL_DENY_SET.has(t.name))
    .map((t) => ({
      name: t.name,
      serverId: t.serverId,
      description: (TOOL_DESCRIPTION_OVERRIDES[t.name] ?? t.description ?? '') + TOOL_ONLY_HINT,
      inputSchema: toRecord(t.inputSchema),
    }));
  _mcpToolDefsCache = mapped;
  log.info`🔧 tools: ${mapped.map((t) => t.name).join(', ')} (${mapped.length}/${tools.length})`;
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
