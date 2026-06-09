/**
 * App-wide LogTape logger.
 * Initialized on first import via hooks.server.ts.
 *
 * Sinks:
 *   - console: getPrettyFormatter (dev readability)
 *   - file: jsonLinesFormatter → ./data/logs/woss.io.log (rotating)
 *
 * Use:
 *   import { CAT, createLogger } from '$lib/server/logger';
 *   const log = createLogger(CAT.app);
 *   log.debug`Hello ${name}`;
 *   log.error`Failed: ${err}`;
 */

import { configure, getConsoleSink, getLogger, jsonLinesFormatter, type Logger } from '@logtape/logtape';
import { getRotatingFileSink } from '@logtape/file';
import { getPrettyFormatter } from '@logtape/pretty';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

/** Categories used across the app — add new ones here. */
export const CAT = {
  app: ['woss', 'app'] as [string, string],
  db: ['woss', 'db'] as [string, string],
  api: ['woss', 'api'] as [string, string],
  llm: ['woss', 'llm'] as [string, string],
  mcp: ['woss', 'mcp'] as [string, string],
  chat: ['woss', 'chat'] as [string, string],
  content: ['woss', 'content'] as [string, string],
  search: ['woss', 'search'] as [string, string],
  hooks: ['woss', 'hooks'] as [string, string],
  rateLimit: ['woss', 'rate-limit'] as [string, string],
} as const;

type Category = string[] & { readonly 0: string; readonly 1: string };

const INIT_KEY = '__woss_log_initialized';

/**
 * Initialize LogTape sinks + loggers.
 * Called once from hooks.server.ts on first request.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initLogger(logLevel: 'trace' | 'debug' | 'info' | 'warning' | 'error' = 'info'): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  if (g[INIT_KEY]) return;
  g[INIT_KEY] = true;

  // Ensure log directory exists
  const logDir = join(process.cwd(), 'data', 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logFile = join(logDir, 'woss.io.log');

  await configure({
    sinks: {
      console: getConsoleSink({ formatter: getPrettyFormatter({ inspectOptions: { colors: true } }) }),
      file: getRotatingFileSink(logFile, {
        formatter: jsonLinesFormatter,
        bufferSize: 0,
        flushInterval: 0,
        nonBlocking: true,
        maxFiles: 7,
        maxSize: 10 * 1024 * 1024, // 10 MB per file
      }),
    },
    loggers: [
      {
        category: ['woss'],
        lowestLevel: logLevel,
        sinks: ['console', 'file'],
      },
      {
        category: ['logtape', 'meta'],
        lowestLevel: 'warning',
        sinks: ['console', 'file'],
      },
    ],
  });
}

/**
 * Create a category-scoped logger.
 *
 * Usage:
 *   const log = logger(CAT.db);
 *   log.debug`Query took ${duration}ms`;
 */
export function createLogger(category: Category): Logger {
  return getLogger(category);
}

// Re-export getLogger for direct use
export { getLogger };
