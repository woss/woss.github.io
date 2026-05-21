// ============================================================
// MCP Tools Unit Tests
// ============================================================

import { mock, describe, it, expect, beforeEach } from 'bun:test';
import { executeMcpToolCall, getOpenAiTools, getSystemPromptAddition, resetOpenAiToolsCache } from './tools';
import type { McpToolDefinition, McpToolCallResult } from './client';

// ---- Mock setup ----

const mockListTools = mock(() => Promise.resolve([] as McpToolDefinition[]));
const mockCallTool = mock(() => Promise.resolve({ content: [] } as McpToolCallResult));

mock.module('./client.ts', () => ({
  mcp: {
    listTools: mockListTools,
    callTool: mockCallTool,
  },
}));

// ============================================================
//  getOpenAiTools
// ============================================================

describe('getOpenAiTools', () => {
  beforeEach(() => {
    mockListTools.mockReset();
    mockCallTool.mockReset();
    resetOpenAiToolsCache();
  });

  it('returns empty array when MCP client returns empty list', async () => {
    mockListTools.mockResolvedValue([]);
    const tools = await getOpenAiTools();
    expect(tools).toEqual([]);
    expect(mockListTools).toHaveBeenCalledTimes(1);
  });

  it('maps MCP tool definitions to OpenAI function-calling format', async () => {
    mockListTools.mockResolvedValue([
      {
        name: 'get_weather',
        description: 'Get current weather for a city',
        serverId: 'github',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
      {
        name: 'search_repos',
        description: 'Search GitHub repos',
        serverId: 'github',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
        },
      },
    ]);

    const tools = await getOpenAiTools();

    expect(tools).toHaveLength(2);
    expect(tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    });
    expect(tools[1]).toEqual({
      type: 'function',
      function: {
        name: 'search_repos',
        description: 'Search GitHub repos',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
        },
      },
    });
  });

  it('handles missing description with empty string', async () => {
    mockListTools.mockResolvedValue([
      { name: 'no_desc_tool', serverId: 'github', inputSchema: { type: 'object', properties: {} } },
    ]);

    const tools = await getOpenAiTools();
    expect(tools[0].function.description).toBe('');
  });

  it('handles missing inputSchema with default object', async () => {
    mockListTools.mockResolvedValue([
      { name: 'no_schema_tool', description: 'tool without schema', serverId: 'github' },
    ]);

    const tools = await getOpenAiTools();
    expect(tools[0].function.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('caches results so listTools is only called once', async () => {
    mockListTools.mockResolvedValue([
      { name: 'tool_a', serverId: 'github', inputSchema: { type: 'object', properties: {} } },
    ]);

    const first = await getOpenAiTools();
    const second = await getOpenAiTools();
    const third = await getOpenAiTools();

    expect(first).toHaveLength(1);
    expect(second).toBe(first); // Same cached array reference
    expect(third).toBe(first);
    expect(mockListTools).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
//  executeMcpToolCall
// ============================================================

describe('executeMcpToolCall', () => {
  beforeEach(() => {
    mockCallTool.mockReset();
  });

  it('parses JSON string arguments and delegates to mcp.callTool', async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Sunny, 22°C' }],
    });

    const result = await executeMcpToolCall({
      name: 'get_weather',
      arguments: '{"city":"Barcelona"}',
    });

    expect(mockCallTool).toHaveBeenCalledWith('get_weather', { city: 'Barcelona' });
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Sunny, 22°C' }],
    });
  });

  it('passes empty object when arguments is undefined', async () => {
    mockCallTool.mockResolvedValue({ content: [] });

    const result = await executeMcpToolCall({
      name: 'simple_tool',
    });

    expect(mockCallTool).toHaveBeenCalledWith('simple_tool', {});
    expect(result).toEqual({ content: [] });
  });

  it('passes empty object when arguments is empty string', async () => {
    mockCallTool.mockResolvedValue({ content: [] });

    const result = await executeMcpToolCall({
      name: 'empty_args_tool',
      arguments: '',
    });

    expect(mockCallTool).toHaveBeenCalledWith('empty_args_tool', {});
    expect(result).toEqual({ content: [] });
  });

  it('handles complex nested arguments', async () => {
    mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });

    const result = await executeMcpToolCall({
      name: 'complex_tool',
      arguments: JSON.stringify({
        filters: { status: 'active', tags: ['urgent', 'bug'] },
        limit: 10,
      }),
    });

    expect(mockCallTool).toHaveBeenCalledWith('complex_tool', {
      filters: { status: 'active', tags: ['urgent', 'bug'] },
      limit: 10,
    });
    expect(result.content[0].text).toBe('done');
  });

  it('throws on invalid JSON arguments', async () => {
    await expect(
      executeMcpToolCall({
        name: 'bad_json',
        arguments: '{invalid json}',
      }),
    ).rejects.toThrow();
  });

  it('returns the full McpToolCallResult from mcp.callTool', async () => {
    const toolResult = {
      content: [
        { type: 'text', text: 'result 1' },
        { type: 'text', text: 'result 2' },
      ],
    };
    mockCallTool.mockResolvedValue(toolResult);

    const result = await executeMcpToolCall({
      name: 'multi_content',
      arguments: '{}',
    });

    expect(result).toEqual(toolResult);
    expect(result.content).toHaveLength(2);
  });
});

// ============================================================
//  getSystemPromptAddition
// ============================================================

describe('getSystemPromptAddition', () => {
  it('returns a string mentioning woss as the GitHub username', () => {
    const prompt = getSystemPromptAddition();
    expect(prompt).toContain('woss');
    expect(prompt).toContain('Daniel Maricic');
  });

  it('instructs LLM to use woss username for GitHub tools', () => {
    const prompt = getSystemPromptAddition();
    expect(prompt).toContain('username');
    expect(prompt).toContain('"woss"');
  });

  it('warns against fabricating data', () => {
    const prompt = getSystemPromptAddition();
    expect(prompt).toContain('fabricate');
    expect(prompt).toContain('tool');
  });

  it('is a non-empty string', () => {
    const prompt = getSystemPromptAddition();
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(50);
  });
});
