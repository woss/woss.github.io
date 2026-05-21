import { config } from '$lib/server/config';
import { initLogger, CAT, createLogger } from '$lib/server/logger';
import type { Handle } from '@sveltejs/kit';

const APP_ORIGIN = config().app.origin;

let logInitialized = false;

export const handle: Handle = async ({ event, resolve }) => {
  // Init logger on first request
  if (!logInitialized) {
    logInitialized = true;
    await initLogger();
    const log = createLogger(CAT.hooks);
    log.info(`Logger initialized. App origin: ${APP_ORIGIN}`);
  }

  const log = createLogger(CAT.hooks);

  // Only check /api/* routes
  if (event.url.pathname.startsWith('/api/')) {
    const origin = event.request.headers.get('origin');
    const referer = event.request.headers.get('referer');

    if (origin && origin !== APP_ORIGIN) {
      log.warn(`Blocked request from invalid origin: ${origin}`);
      return new Response(JSON.stringify({ error: 'Forbidden: invalid origin' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!origin && (!referer || !referer.startsWith(APP_ORIGIN))) {
      log.warn(`Blocked request with missing origin and no valid referer: ${referer ?? 'none'}`);
      return new Response(JSON.stringify({ error: 'Forbidden: missing origin and no valid referer' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  return resolve(event);
};
