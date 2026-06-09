/**
 * Multi-MCP server orchestration.
 *
 * McpManager connects to all configured MCP servers and provides
 * aggregated tool listing with collision resolution, tool execution
 * routing, and clean shutdown.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { CAT, createLogger } from '$lib/server/logger';
import type { McpServerConfig } from './config.ts';
import type { jsonSchemaValidator, JsonSchemaType, JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';

const log = createLogger(CAT.mcp);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type McpConnection = {
  client: Client;
  transport: StreamableHTTPClientTransport;
};

export type McpToolDefinition = {
  name: string;
  serverId: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpToolCallResult = { content: Array<{ type?: string; text?: string }> };

export type McpResourceInfo = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
};

export type McpResourceContent = {
  uri: string;
  text: string;
  mimeType?: string;
};

export type McpPromptInfo = {
  name: string;
  description?: string;
  serverId: string;
};

export type McpPromptMessage = {
  role: string;
  text: string;
};

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
 * Extract type/text fields from MCP content items without type casts.
 * Each item is checked at runtime for shape before field access.
 */
function parseMcpContent(content: unknown[]): Array<{ type?: string; text?: string }> {
  return content.map((item) => {
    if (typeof item !== 'object' || item === null) return {};
    return {
      type: 'type' in item && typeof item.type === 'string' ? item.type : undefined,
      text: 'text' in item && typeof item.text === 'string' ? item.text : undefined,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Noop JSON Schema Validator                                         */
/* ------------------------------------------------------------------ */

/**
 * No-op validator that accepts all input without validation.
 * MCP tools provide their own validation if needed — this avoids
 * the overhead of AJV or other schema validators at the manager level.
 */
class NoopValidator implements jsonSchemaValidator {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getValidator<T>(_schema: JsonSchemaType): JsonSchemaValidator<T> {
    return (input: unknown) => ({
      valid: true as const,
      // Intentional: no-op validator trusts all input as type T.
      // This `as T` is the entire point — we skip validation and accept the type assertion.
      data: input as T,
      errorMessage: undefined,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Manager                                                            */
/* ------------------------------------------------------------------ */

export class McpManager {
  private connections = new Map<string, McpConnection>();
  private toolIndex = new Map<string, string>(); // resolvedName → serverId
  private toolDefs: McpToolDefinition[] = [];
  private initialized = false;

  constructor(private configs: readonly McpServerConfig[]) {}

  /* ── Connection ───────────────────────────────────────────────── */

  async init(): Promise<void> {
    for (const cfg of this.configs) {
      try {
        const client = new Client(
          { name: `woss-mcp-${cfg.id}`, version: '1.0.0' },
          {
            capabilities: {},
            /**
             * MCP tools should provide their own JSON schema validation if needed, so we can use a no-op validator here to avoid unnecessary overhead and complexity in the manager.
             */
            jsonSchemaValidator: new NoopValidator(),
          },
        );

        const headers: Record<string, string> = {
          Authorization: `Bearer ${cfg.token}`,
        };
        if (cfg.readonly) {
          headers['X-MCP-Readonly'] = 'true';
        }
        if (cfg.tools) {
          headers['X-MCP-Tools'] = cfg.tools;
        }

        const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: { headers },
          ...(cfg.timeout ? { timeout: cfg.timeout } : {}),
        });

        await client.connect(transport);
        this.connections.set(cfg.id, { client, transport });
        log.debug`connected: ${cfg.id} (${cfg.url})`;
      } catch (err) {
        log.debug`connect failed: ${cfg.id} — ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Pre-fetch tool definitions
    await this.refreshToolIndex();
    this.initialized = true;
  }

  /* ── Server Status ────────────────────────────────────────────── */

  getServerStatus(): Array<{ id: string; label?: string; connected: boolean; homepage?: string }> {
    if (!this.initialized) return this.configs.map((c) => ({ id: c.id, connected: false }));
    return this.configs.map((cfg) => ({
      id: cfg.id,
      label: cfg.label,
      connected: this.connections.has(cfg.id),
      homepage: cfg.homepage,
    }));
  }

  /* ── Tool Index ───────────────────────────────────────────────── */

  private async refreshToolIndex(): Promise<void> {
    const all: McpToolDefinition[] = [];
    const nameCounts = new Map<string, number>();
    this.toolDefs = [];

    for (const [serverId, { client }] of this.connections) {
      try {
        const result = await client.listTools();
        for (const tool of result.tools) {
          all.push({
            name: tool.name,
            serverId,
            description: tool.description,
            inputSchema: toRecord(tool.inputSchema),
          });
          nameCounts.set(tool.name, (nameCounts.get(tool.name) ?? 0) + 1);
        }
        log.trace`tools loaded for ${serverId}: ${result.tools.length}`;
      } catch (err) {
        log.debug`listTools failed for ${serverId}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Build tool index with collision resolution
    this.toolIndex.clear();
    for (const tool of all) {
      const needsPrefix = (nameCounts.get(tool.name) ?? 0) > 1;
      const resolvedName = needsPrefix ? `${tool.serverId}_${tool.name}` : tool.name;
      this.toolIndex.set(resolvedName, tool.serverId);
      this.toolDefs.push({ ...tool, name: resolvedName });
    }

    log.debug`tool index: ${this.toolDefs.length} tools from ${this.connections.size} servers`;
  }

  /* ── Tool Listing ─────────────────────────────────────────────── */

  listAllTools(): McpToolDefinition[] {
    return this.toolDefs;
  }

  /* ── Resources ────────────────────────────────────────────────── */

  async listAllResources(): Promise<McpResourceInfo[]> {
    const all: McpResourceInfo[] = [];
    for (const [serverId, { client }] of this.connections) {
      try {
        const result = await client.listResources();
        for (const resource of result.resources) {
          all.push({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
            serverId,
          });
        }
      } catch (err) {
        log.debug`listResources failed for ${serverId}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return all;
  }

  async readResource(uri: string, serverId?: string): Promise<McpResourceContent | null> {
    if (serverId) {
      const conn = this.connections.get(serverId);
      if (!conn) return null;
      try {
        const result = await conn.client.readResource({ uri });
        for (const content of result.contents) {
          if ('text' in content) {
            return { uri: content.uri, text: content.text, mimeType: content.mimeType };
          }
        }
      } catch (err) {
        log.debug`readResource failed for ${uri} on ${serverId}: ${err instanceof Error ? err.message : String(err)}`;
      }
      return null;
    }
    for (const [sid, { client }] of this.connections) {
      try {
        const result = await client.readResource({ uri });
        for (const content of result.contents) {
          if ('text' in content) {
            return { uri: content.uri, text: content.text, mimeType: content.mimeType };
          }
        }
      } catch (err) {
        log.debug`readResource failed for ${uri} on ${sid}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return null;
  }

  /* ── Prompts ──────────────────────────────────────────────────── */

  async listAllPrompts(): Promise<McpPromptInfo[]> {
    const all: McpPromptInfo[] = [];
    for (const [serverId, { client }] of this.connections) {
      try {
        const result = await client.listPrompts();
        for (const prompt of result.prompts) {
          all.push({
            name: prompt.name,
            description: prompt.description,
            serverId,
          });
        }
      } catch (err) {
        log.debug`listPrompts failed for ${serverId}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return all;
  }

  async getPrompt(name: string, serverId?: string): Promise<McpPromptMessage[]> {
    if (serverId) {
      const conn = this.connections.get(serverId);
      if (!conn) return [];
      try {
        const result = await conn.client.getPrompt({ name });
        return result.messages.map((m) => ({
          role: m.role,
          text: m.content.type === 'text' ? m.content.text : '',
        }));
      } catch (err) {
        log.debug`getPrompt failed for ${name} on ${serverId}: ${err instanceof Error ? err.message : String(err)}`;
      }
      return [];
    }
    for (const [sid, { client }] of this.connections) {
      try {
        const result = await client.getPrompt({ name });
        return result.messages.map((m) => ({
          role: m.role,
          text: m.content.type === 'text' ? m.content.text : '',
        }));
      } catch (err) {
        log.debug`getPrompt failed for ${name} on ${sid}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return [];
  }

  /* ── Tool Execution ───────────────────────────────────────────── */

  async executeTool(resolvedName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const serverId = this.toolIndex.get(resolvedName);
    if (!serverId) throw new Error(`Unknown tool: ${resolvedName}`);

    const conn = this.connections.get(serverId);
    if (!conn) throw new Error(`Server not connected: ${serverId}`);

    // Strip prefix to get original tool name
    const originalName = this.stripPrefix(resolvedName, serverId);

    log.debug`execute: ${resolvedName} → ${serverId}.${originalName}`;

    const result = await Promise.race([
      conn.client.callTool({ name: originalName, arguments: args }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MCP callTool timed out after 60s for ${resolvedName}`)), 60_000),
      ),
    ]);

    log.debug`[mcp/manager] executeTool ${resolvedName} response: content.length=${result.content.length}, isError=${result.isError}`;

    let contentItems = parseMcpContent(result.content);
    if (result.isError) {
      const errText = contentItems
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join(' | ');
      contentItems = [{ type: 'text', text: `Tool returned an error: ${errText || 'Unknown error'}` }];
      log.debug`[mcp/manager] executeTool ${resolvedName} ERROR: ${errText || 'Unknown error'}`;
    } else if (contentItems.length === 0) {
      contentItems = [{ type: 'text', text: `Tool "${resolvedName}" returned no output.` }];
    }

    return { content: contentItems };
  }

  /* ── Helpers ──────────────────────────────────────────────────── */

  /**
   * Strip the serverId prefix from a resolved tool name.
   * e.g. "github_get_me" → "get_me" when serverId is "github"
   */
  private stripPrefix(resolvedName: string, serverId: string): string {
    const prefix = `${serverId}_`;
    if (resolvedName.startsWith(prefix)) {
      return resolvedName.slice(prefix.length);
    }
    return resolvedName;
  }

  /* ── System Prompt ────────────────────────────────────────────── */

  getSystemPrompt(): string {
    const parts: string[] = [];
    for (const serverId of this.connections.keys()) {
      const toolsForServer = this.toolDefs.filter((t) => t.serverId === serverId);
      parts.push(`[${serverId}] MCP tools: ${toolsForServer.map((t) => t.name).join(', ')}.`);
    }
    return parts.join('\n');
  }

  /* ── Shutdown ─────────────────────────────────────────────────── */

  async disconnectAll(): Promise<void> {
    for (const [serverId, { transport }] of this.connections) {
      try {
        await transport.close();
        log.debug`disconnected: ${serverId}`;
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
    this.toolIndex.clear();
    this.toolDefs = [];
  }
}
