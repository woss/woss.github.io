/**
 * MCP tool adapter for OpenAI function-calling.
 * Converts MCP tool definitions to OpenAI tool format and executes calls.
 */
import { mcp } from './client.ts';
import { CAT, createLogger } from '$lib/server/logger';
import type { McpToolDefinition, McpToolCallResult } from './client.ts';
import { config } from '../config.ts';

const log = createLogger(CAT.mcp);

/** Description overrides for tools needing critical LLM usage hints */
const TOOL_DESCRIPTION_OVERRIDES: Record<string, string> = {
  traverse:
    'Primary content discovery tool. from types: user(nickname), keyword(keyword), license(license), directory(pathCid), file(unifiedId), root. EDGE RULES: user→uploads|profile, keyword→tagged_files, license→has_license, directory→contains|info, file→info, root→random|recent|search|keywords. Use filter.what(images|videos|files|all) to narrow. File fields: id, title, kind, mimeType, rawDataUrl (+ "?preset=sys_*" for renditions), htmlPageUrl, buyPageUrl, thumbnailUrl, fileSize, publishedAt, license, owner (nickname, displayName, avatarUrl), keywords[], directory (pathCid, name), dataMining. Returns {items, total, after} for paginated edges or {item} for single-item edges. CRITICAL: directory pathCid MUST come from get_users directories[].pathCid. Fabricated CIDs return 0 items. CRITICAL: only root supports random|recent edges. NEVER use recent or random edge with user — those only work with root and will return an error.',
  get_users:
    'Batch lookup Macula user profiles by nickname array. Returns UserNode with avatarUrl, bio, fileCount, and directories (albums with pathCid, name, fileCount). Null for not-found nicknames. Use this to get REAL directory pathCids before calling traverse(directory→contains).',

  get_file:
    'Get file/media info from Macula by unifiedId. Use `fields` to select specific fields via JSONPath (e.g. fields=["title","_links.raw","ai.model"]). Returns title, description, creator, dimensions, filesize, _links (raw, base, buy, json, jsonLd, metadata, copyright, webStatement, license), AI metadata, license, owner. _links.raw + "?preset=sys_md" gives the medium rendition URL. Use get_file when you need EXIF, AI metadata, copyright, or _links details beyond rawDataUrl/htmlPageUrl/buyPageUrl. Primary tool for rich metadata beyond traverse results.',
  get_file_metadata:
    'Get full EXIF/XMP/IPTC metadata for a Macula file. Returns camera details (make, model, ISO, aperture, shutter speed, GPS), panorama stitching info, music metadata.',
  search_repositories:
    "Discover GitHub repositories by name, description, topic, or README content. Essential for verifying repo existence and finding Daniel Maricic's projects. Always use when asked about a specific repo to confirm it exists before answering. Supports advanced qualifiers: repo:owner/name, user:woss, language:typescript, topic:react, etc.",
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
      'GITHUB — Daniel Maricic (woss). Available tools:\n' +
      '  1. search_issues — find issues by keyword.\n' +
      '  2. list_issues / issue_read — browse and read issues.\n' +
      '  3. list_pull_requests / pull_request_read — browse and read PRs.\n' +
      '  4. search_repositories — discover repos by name/keyword/topic. Essential for verifying repo existence.\n' +
      '  5. get_tag — look up git tags.\n' +
      '  6. get_me — get authenticated user info.\n\n' +
      'All GitHub tools: use username "woss" (not "Daniel" or "Daniel Maricic").\n\n';
  }
  const maculaNickname = config().maculaNickname;
  if (mac) {
    result +=
      '---\n' +
      "MACULA — Daniel's media library. Rules:\n" +
      `  • Profile + directories: get_users(["${maculaNickname}"]). Get REAL pathCid from directories[].pathCid.\n` +
      `  • List images: traverse(user→uploads, filter={what:"images"}).\n` +
      `  • Album contents: traverse(directory→contains). REQUIRES pathCid from get_users. Fabricated pathCids return 0 items — ALWAYS call get_users FIRST.\n` +
      '  • Title search: traverse(search, query="..."); keyword discovery: traverse(keywords, query="...").\n' +
      '  • Display images: item.rawDataUrl + "?preset=sys_md" for src (not sys_orig or sys_sm). item.htmlPageUrl for page link, item.buyPageUrl for purchase.\n' +
      '  • Extra metadata (EXIF, AI, _links): get_file(unifiedId).\n' +
      '  • Biographical info: get_users or user→profile edge — bio in response.\n\n' +
      '  • CRITICAL: NEVER use edge="recent" or edge="random" on user — those edges only work with root and will ERROR. Use uploads for listing user\'s media.\n' +
      'MEDIA QUERY WORKFLOW (immutable):\n' +
      `  1. get_users(["${maculaNickname}"]) → profile + directories (get pathCids).\n` +
      '  2. traverse(user→uploads, filter=images) or traverse(directory→contains) with pathCid from step 1.\n' +
      '  3. Display up to 15 images inline with rawDataUrl + "?preset=sys_md".\n' +
      '  4. (Optional) get_file(unifiedId) when user needs EXIF, AI metadata, copyright, license, or _links beyond rawDataUrl/htmlPageUrl/buyPageUrl.\n' +
      '  NEVER skip step 1. NEVER fabricate pathCids. NEVER construct image URLs from CIDs — only use rawDataUrl from traverse results. After get_users, do NOT answer — call traverse FIRST.\n\n' +
      'IMAGE RULES:\n' +
      '  • Format: **{title}** (from data, never invented) then ![Photo]({rawDataUrl}?preset=sys_md) then [View on Macula]({htmlPageUrl}).\n' +
      '  • Each file object from traverse has a "rawDataUrl" field — use that exact value with "?preset=sys_md" appended for display (e.g. https://u.macula.link/abc123?preset=sys_md). Never modify or guess these URLs. Do NOT construct image URLs from directory listing CIDs — rawDataUrl from traverse is the ONLY valid source.\n' +
      '  • Repeat requests = fresh workflow from step 1. Never say "already showed you."\n' +
      '  • When tools available, call them freely. Treat empty traverse results as signal to re-check tools.\n' +
      '  • PRECEDENCE: The MEDIA QUERY WORKFLOW and IMAGE RULES above override any MCP prompt templates that conflict.\n';
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

/**
 * Synthesis-phase system prompt.
 * Removes MEDIA QUERY WORKFLOW + IMAGE RULES that tell the model
 * to keep calling tools instead of producing a final answer.
 * Keeps tool capability info so model CAN call tools if needed.
 */
function getSynthesisSystemPrompt(options?: SystemPromptOptions): string {
  const gh = options?.github ?? true;
  const mac = options?.macula ?? true;

  let result =
    'You are in the SYNTHESIS PHASE — produce a complete final answer now.\n' +
    'You have already received data from tool calls. Synthesize what you have into a finished response.\n' +
    'Do NOT repeat the media query workflow steps — the data is already available in conversation.\n' +
    'If you need additional detail that is clearly missing, you may call ONE more tool, but prioritize writing the final answer with what you have.\n\n';

  if (gh) {
    result +=
      'GITHUB — Daniel Maricic (woss). Available tools:\n' +
      '  1. search_issues — find issues by keyword.\n' +
      '  2. list_issues / issue_read — browse and read issues.\n' +
      '  3. list_pull_requests / pull_request_read — browse and read PRs.\n' +
      '  4. search_repositories — discover repos by name/keyword/topic. Essential for verifying repo existence.\n' +
      '  5. get_tag — look up git tags.\n' +
      '  6. get_me — get authenticated user info.\n\n' +
      'All GitHub tools: use username "woss" (not "Daniel" or "Daniel Maricic").\n\n';
  }
  const maculaNickname = config().maculaNickname;
  if (mac) {
    result +=
      'MACULA — Daniel\'s media library. Available operations:\n' +
      `  • Profile + directories: get_users(["${maculaNickname}"]). Get REAL pathCid from directories[].pathCid.\n` +
      `  • List images: traverse(user→uploads, filter={what:"images"}).\n` +
      `  • Album contents: traverse(directory→contains). REQUIRES pathCid from get_users.\n` +
      '  • Title search: traverse(search, query="..."); keyword discovery: traverse(keywords, query="...").\n' +
      '  • Display images: item.rawDataUrl + "?preset=sys_md" for src. item.htmlPageUrl for page link, item.buyPageUrl for purchase.\n' +
      '  • Extra metadata (EXIF, AI, _links): get_file(unifiedId).\n' +
      '  • Biographical info: get_users or user→profile edge — bio in response.\n\n' +
      '  • CRITICAL: NEVER use edge="recent" or edge="random" on user — those edges only work with root and will ERROR. Use uploads for listing user\'s media.\n' +
      'IMAGE FORMAT:\n' +
      '  • Format: **{title}** (from data, never invented) then ![Photo]({rawDataUrl}?preset=sys_md) then [View on Macula]({htmlPageUrl}).\n' +
      '  • Each file object from traverse has a "rawDataUrl" field — use that exact value with "?preset=sys_md" appended for display (e.g. https://u.macula.link/abc123?preset=sys_md).\n';
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
  const mapped = tools.map((t) =>
      toOpenAiTool({
        name: t.name,
        serverId: t.serverId,
        description: (TOOL_DESCRIPTION_OVERRIDES[t.name] ?? t.description ?? '') + TOOL_ONLY_HINT,
        inputSchema: toRecord(t.inputSchema),
      }),
    );
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
  const mapped = tools.map((t) => ({
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
  log.debug`Tool call: ${toolCall.name}(${JSON.stringify(args)})`;
  const result = await mcp.callTool(toolCall.name, args);
  // Check if any content item indicates a tool error
  const errorText = (result.content ?? [])
    .filter((c: { type?: string; text?: string }) => c.type === 'text' && c.text?.startsWith('Tool returned an error'))
    .map((c: { text?: string }) => c.text)
    .join(' | ');
  if (errorText) {
    log.warn`Tool ${toolCall.name} returned error: ${errorText}`;
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
    const content = await mcp.readResource(resource.uri, resource.serverId);
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
    const messages = await mcp.getPrompt(prompt.name, prompt.serverId);
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
  getSynthesisSystemPrompt,
  resetMcpToolDefsCache,
  resetMcpResourceContent,
  resetMcpPromptContent,
  resetOpenAiToolsCache,
};
