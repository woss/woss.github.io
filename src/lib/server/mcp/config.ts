/**
 * MCP server configuration types and env-var parser.
 *
 * Parses the MCP_SERVERS JSON env var into an array of McpServerConfig.
 * Supports $VAR placeholder substitution from process.env.
 */

export type McpServerConfig = {
  /** Unique identifier (used as prefix for tool name collisions) */
  id: string;
  /** MCP endpoint URL */
  url: string;
  /** Bearer token (env var references like $GITHUB_TOKEN are resolved) */
  token: string;
  /** Set X-MCP-Readonly header if true */
  readonly?: boolean;
  /** If false, this server is skipped. Default true. */
  enabled?: boolean;
  /** Connection timeout in ms */
  timeout?: number;
  /** User-visible server name (e.g. "GitHub", "Macula"). Falls back to id. */
  label?: string;
  /** Homepage URL (e.g. for linking) */
  homepage?: string;
  /** Comma-separated list of tool names to expose (X-MCP-Tools header). If unset, all tools loaded. */
  tools?: string;
};

/**
 * Parse MCP_SERVERS JSON env var, resolving $VAR placeholders from process.env.
 * Filters out disabled servers (enabled: false).
 * Returns empty array if raw is undefined/null/empty.
 */
export function parseMcpServers(raw: string | undefined): McpServerConfig[] {
  if (!raw) return [];

  // Resolve $VAR and ${VAR} placeholders from process.env
  const resolved = raw.replace(/\$(\w+)|\$\{(\w+)\}/g, (match, v1, v2) => {
    const name = v1 ?? v2;
    return process.env[name] ?? match;
  });
  const parsed: McpServerConfig[] = JSON.parse(resolved);

  return parsed.filter((s) => s.enabled !== false);
}
