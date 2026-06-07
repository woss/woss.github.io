import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
  getPosts,
  insertLead,
  updateUserContact,
  createChat,
  getChat,
  deleteChat,
  getUserChatCount,
  getOrCreateUserAgent,
} from '$lib/server/db';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { callWebhook } from '$lib/server/webhooks';
import { CAT, createLogger } from '$lib/server/logger';
import { config } from '$lib/config';


export async function load() {
  const allPosts = getPosts();

  const heroPage = allPosts.find((p) => p.slug === 'new-woss-io');
  const hero = heroPage
    ? {
        title: heroPage.title || '',
        description: heroPage.description || '',
      }
    : null;

  const featuredPosts = allPosts
    .filter((p) => p.featured)
    .map((p) => ({
      slug: p.slug,
      title: p.title || p.slug,
      description: p.description || '',
      date: p.date || '',
      tags: p.tags,
      headerImage: p.headerImage ?? null,
    }));

  return { hero, featuredPosts };
}

const log = createLogger(CAT.app);

// Lead-specific rate limiter (3/hour/IP)
const LEAD_WINDOW_MS = 3600_000;
const LEAD_MAX = 3;
const leadHits = new Map<string, number[]>();

function checkLeadRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  if (!ip) return { allowed: false, remaining: 0, resetAt: Date.now() + LEAD_WINDOW_MS };
  const now = Date.now();
  const windowStart = now - LEAD_WINDOW_MS;
  const prev = leadHits.get(ip) ?? [];
  const windowed = prev.filter((t) => t > windowStart);
  if (windowed.length >= LEAD_MAX) {
    const oldest = windowed[windowed.length - 1];
    return { allowed: false, remaining: 0, resetAt: oldest + LEAD_WINDOW_MS };
  }
  windowed.push(now);
  leadHits.set(ip, windowed);
  return { allowed: true, remaining: LEAD_MAX - windowed.length, resetAt: now + LEAD_WINDOW_MS };
}

function sanitizeText(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

function getClientIP(event: RequestEvent): string {
  return event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? event.getClientAddress();
}

export const actions = {
  contact: async (event: RequestEvent) => {
    const { request, url } = event;

    // 1. Origin check — reject if no Origin header (stricter than SvelteKit's default)
    const origin = request.headers.get('origin');
    if (!origin || origin !== url.origin) {
      throw error(403, 'Forbidden');
    }

    // 2. Parse form data
    const data = await request.formData();
    const userId = data.get('userId')?.toString() || '';
    const name = data.get('name')?.toString() || '';
    const email = data.get('email')?.toString() || '';
    const companyName = data.get('companyName')?.toString() || '';
    const role = data.get('role')?.toString() || '';
    const message = data.get('message')?.toString() || '';

    // 3. Validate required fields
    if (!userId) return fail(400, { error: 'userId is required' });
    if (!name) return fail(400, { error: 'Name is required' });
    if (!email) return fail(400, { error: 'Email is required' });

    // 4. Sanitize inputs
    const sanitizedName = sanitizeText(name).slice(0, 100);
    const sanitizedEmail = sanitizeText(email).slice(0, 200);
    const sanitizedCompany = companyName ? sanitizeText(companyName).slice(0, 200) : '';
    const sanitizedRole = role ? sanitizeText(role).slice(0, 200) : '';
    const sanitizedMessage = message ? sanitizeText(message).slice(0, 1000) : '';

    if (!sanitizedName) return fail(400, { error: 'Name cannot be empty' });
    if (!sanitizedEmail) return fail(400, { error: 'Email cannot be empty' });

    // 5. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return fail(400, { error: 'Invalid email format' });
    }

    // 6. Rate limit by IP
    const ip = getClientIP(event);
    const rl = checkLeadRateLimit(ip);
    if (!rl.allowed) {
      return fail(429, { error: 'Too many submissions. Please try again later.' });
    }
    const generalRl = checkRateLimit(ip);
    if (!generalRl.allowed) {
      return fail(429, { error: 'Too many requests. Please slow down.' });
    }

    // 7. Save to DB
    try {
      updateUserContact(userId, sanitizedName, sanitizedEmail);
      insertLead(userId, sanitizedName, sanitizedEmail, sanitizedCompany, sanitizedRole, sanitizedMessage, ip);
    } catch (e) {
      log.error`Failed to save lead: ${e}`;
      return fail(500, { error: 'Failed to save your request. Please try again.' });
    }

    // 8. Fire and forget webhook
    callWebhook({
      type: 'contactSubmitted',
      userAgent: event.request.headers.get('user-agent') ?? undefined,
    }).catch((e) => log.warn`Webhook failed: ${e}`);

    // 9. Return success
    return { success: true };
  },

  create: async (event: RequestEvent) => {
    const { request } = event;

    const data = await request.formData();
    const userId = data.get('userId')?.toString();

    if (!userId) return fail(400, { error: 'userId is required' });

    const count = getUserChatCount(userId);
    if (count >= config.public.maxChats) {
      return fail(400, { error: `Maximum ${config.public.maxChats} chats allowed` });
    }

    try {
      const ip = event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? event.getClientAddress();
      const userAgent = event.request.headers.get('user-agent');
      const userAgentId = userAgent ? getOrCreateUserAgent(userAgent, ip) : undefined;
      const id = createChat(userId, undefined, userAgentId);
      return { id };
    } catch (e) {
      log.error`Failed to create chat: ${e}`;
      return fail(500, { error: 'Failed to create chat' });
    }
  },

  delete: async (event: RequestEvent) => {
    const { request } = event;

    const data = await request.formData();
    const userId = data.get('userId')?.toString();
    const chatId = data.get('chatId')?.toString();

    if (!userId) return fail(400, { error: 'userId is required' });
    if (!chatId) return fail(400, { error: 'chatId is required' });

    try {
      const chat = getChat(chatId);
      if (!chat) return fail(404, { error: 'Chat not found' });
      if (chat.userId !== userId) return fail(403, { error: 'Forbidden' });

      deleteChat(chatId);
      return { success: true, chatId };
    } catch (e) {
      log.error`Failed to delete chat: ${e}`;
      return fail(500, { error: 'Failed to delete chat' });
    }
  },
};
