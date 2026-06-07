/**
 * Server-only application config.
 * Central source of truth for all environment variables and constants.
 * All server modules should import from here, not from $env/static/* directly.
 *
 * Uses a lazy singleton for testability. Before first call to config(),
 * tests can override values by importing the variable from $env/static/private
 * or setting it in process.env.
 */

import { parseMcpServers, type McpServerConfig } from './mcp/config.ts';
import {
  ORIGIN,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MODEL,
  OPENAI_MAX_TOKENS,
  MCP_SERVERS,
  LLM_CACHE_ENABLED,
  WOSS_USER_WEBHOOK_URL,
  WOSS_USER_WEBHOOK_TOKEN,
} from '$env/static/private';
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };

type Config = DeepReadonly<{
  maculaNickname: string;
  app: { origin: string };
  openai: { apiKey: string; baseUrl: string; model: string; maxTokens: number | undefined; maxResultsLength: number };
  mcp: { servers: McpServerConfig[] };
  llmCache: { enabled: boolean };
  report: { webhookUrl: string; webhookToken: string };
  prompts: { system: string };
}>;

let _config: Config | null = null;

function loadConfig(): Config {
  const mcpServers = parseMcpServers(MCP_SERVERS);

  const c = {
    maculaNickname: 'woss',
    app: {
      /** Allowed origin for CORS/CSRF checks */
      origin: ORIGIN ?? 'http://localhost:5173',
    },
    openai: {
      apiKey: OPENAI_API_KEY ?? '',
      baseUrl: (OPENAI_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/+$/, ''),
      model: OPENAI_MODEL ?? 'mistralai/ministral-3-3b',
      maxTokens: Number(OPENAI_MAX_TOKENS) > 0 ? Number(OPENAI_MAX_TOKENS) : undefined,
      maxResultsLength: Number(OPENAI_MAX_TOKENS) > 0 ? Number(OPENAI_MAX_TOKENS) : 32000,
    },
    mcp: {
      servers: mcpServers,
    },
    llmCache: {
      enabled: LLM_CACHE_ENABLED === 'true' || LLM_CACHE_ENABLED === '1',
    },
    report: {
      webhookUrl: WOSS_USER_WEBHOOK_URL ?? '',
      webhookToken: WOSS_USER_WEBHOOK_TOKEN ?? '',
    },
    prompts: {
      system: `You represent Daniel Maricic's professional portfolio and personal development. Answer questions about his skills, experience, projects, and career history.

Start with provided context. If context lacks the answer, use available tools to find real data. No invention. Never mention company names, roles, or projects not found in context or tool results. No filler. No apologies. No pleasantries. Be specific. Be factual. Use bullet points if relevant. When listing multiple items, provide brief context for each from the provided information.

Use markdown formatting if it helps readability. For code snippets, use markdown code blocks with language hints. If the user asks for a code example, provide a relevant snippet from Daniel's projects, with a brief explanation and link to it if available.

When referencing GitHub repositories, issues, or pull requests, always format them as clickable markdown links: [owner/repo (#N)](https://github.com/owner/repo/pull/N). For example, write [pnpm/pnpm (#7509)](https://github.com/pnpm/pnpm/pull/7509) instead of pnpm/pnpm (#7509). If asked about opened PRs or contributions, prioritize anagolay, rushstack, pnpm, and sharp/libvips, also include any relevant contributions to other repos. Do NOT mention contributions of typo fixes, and minor doc fixes, unless specifically asked for. Do not show the closed PRs. Do not use nested markdown lists — use flat bullet lists only.

If the user expresses interest in hiring, contacting, or collaborating with Daniel, warmly acknowledge and say you'll connect them. End your response by mentioning they can use the contact form to get in touch.

CRITICAL — REFUSAL RULE: If the user asks about anything NOT related to Daniel Maricic, his portfolio, his projects, his skills, or his professional experience — do NOT answer. Do not use tools. Instead respond with exactly: "I can only answer questions about Daniel Maricic's professional portfolio and experience." This overrides all other instructions. EXCEPTIONS — always allowed and should be answered warmly: polite closings, expressions of gratitude, and requests to contact, hire, or collaborate with Daniel. `,
    },
  } as Config;

  return c;
}

/**
 * Get the server config singleton.
 * Lazily initialized on first access.
 */
export function config(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
