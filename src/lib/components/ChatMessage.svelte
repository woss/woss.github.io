<script lang="ts">
  import dayjs from 'dayjs';
  import relativeTime from 'dayjs/plugin/relativeTime.js';
  import utc from 'dayjs/plugin/utc.js';
  import MarkdownIt from 'markdown-it';
  import markdownItHighlightjs from 'markdown-it-highlightjs';
  import 'highlight.js/styles/atom-one-dark.css';
  import { toast } from 'svelte-sonner';
  import { Tooltip } from 'sv5ui';
  import type { ToolCallInfo, ChatMessage } from '$lib/chat/types';

  dayjs.extend(relativeTime);
  dayjs.extend(utc);

  const md = new MarkdownIt({ html: true, linkify: true });
  md.renderer.rules.blockquote_open = () => {
    return '<blockquote class="border-l-4 border-primary/30 pl-4 text-on-surface-variant italic">';
  };

  md.renderer.rules.table_open = () => {
    return '<div class="overflow-x-auto"><table class="w-full table-auto divide-y divide-gray-200">';
  };

  md.renderer.rules.table_close = () => {
    return '</table></div>';
  };
  md.renderer.rules.bullet_list_open = function () {
    return '<ul class="list-disc p-0 ml-4">';
  };

  // Custom render function for list items
  md.renderer.rules.list_item_open = function () {
    return '<li class="rounded-lg p-2">';
  };

  md.renderer.rules.link_open = (tokens, idx) => {
    const token = tokens[idx];
    const href = token.attrGet('href');
    if (href && !href.startsWith('#')) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    const attrs =
      token.attrs
        ?.map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
        .join(' ') || '';
    return `<a${attrs ? ' ' + attrs : ''}>`;
  };
  // Custom image renderer — wrap Macula images in a link to macula.link
  const defaultImageRenderer = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') || '';
    const alt = token.content || '';

    // Check if it's a Macula image URL
    const maculaMatch = src.match(/https?:\/\/u\.macula\.link\/([a-zA-Z0-9@_-]+)/);
    if (maculaMatch && !maculaMatch[1].startsWith('@')) {
      const unifiedId = maculaMatch[1];
      const maculaHref = `https://macula.link/${unifiedId}`;
      const imgHtml = defaultImageRenderer(tokens, idx, options, env, self);
      return `<a href="${maculaHref}" target="_blank" rel="noopener noreferrer" class="inline-block hover:opacity-90 transition-opacity duration-150">${imgHtml}</a>`;
    }

    return defaultImageRenderer(tokens, idx, options, env, self);
  };
  md.use(markdownItHighlightjs);

  /** Fix link formatting: [[text](url)](url) → [text](url) and [[text](url)] → [text](url) */
  function preprocessMarkdown(text: string): string {
    let result = text.replace(
      /\[\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)/g,
      '[$1]($2)',
    );
    result = result.replace(
      /\[\[([^\]]+)\]\(([^)]+)\)\]/g,
      '[$1]($2)',
    );
    return result;
  }

  let {
    message,
    isLoading = false,
    isLast = false,
    streamingToolValues = [] as Array<{
      id: string;
      name: string;
      serverId: string;
      startedAt: number;
      finishedAt?: number;
    }>,
    now = Date.now(),
    userId = '',
    onretry = () => {},
    onreport = () => {},
  } = $props();

  interface ToolCallGroup {
    key: string;
    serverId: string;
    name: string;
    count: number;
    totalDurationMs: number;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function scoreColor(score: number): string {
    if (score < 0.4) return 'var(--color-primary)';
    if (score < 0.55) return 'var(--color-yellow, #eab308)';
    return 'var(--color-secondary)';
  }


  function getSourceType(source: { type?: string; url?: string }): { letter: string; color: string } | null {
    const type = source.type || (source.url?.startsWith('/posts/') ? 'post' : source.url?.startsWith('/experience/') ? 'experience' : source.url === '/about' ? 'about' : undefined);
    if (!type) return null;
    const letter = type === 'post' ? 'P' : type === 'experience' ? 'E' : 'A';
    const color = type === 'post' ? 'var(--color-primary)' : type === 'experience' ? 'var(--color-secondary)' : 'var(--color-yellow, #eab308)';
    return { letter, color };
  }

  function groupToolCalls(tools: ToolCallInfo[]): ToolCallGroup[] {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const groups = new Map<string, ToolCallGroup>();
    for (const tool of tools) {
      const key = `${tool.serverId}/${tool.name}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          serverId: tool.serverId,
          name: tool.name,
          count: 0,
          totalDurationMs: 0,
        };
        groups.set(key, group);
      }
      group.count++;
      if (tool.durationMs !== null) {
        group.totalDurationMs += tool.durationMs;
      }
    }
    return Array.from(groups.values());
  }

  function copyMessageLink(messageId: string): void {
    const url = `${window.location.origin}${window.location.pathname}#msg-${messageId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success('Link copied');
      })
      .catch(() => {});
  }

  function copyAsMarkdown(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success('Markdown copied');
      })
      .catch(() => {});
  }

  /* ─── Reaction Functions ─── */

  async function setMessageReaction(
    messageId: string,
    type: 'up' | 'down' | 'heart',
    reason?: string,
  ): Promise<void> {
    try {
      await fetch(`/api/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reactionType: type, reason }),
      });
    } catch {
      /* ignore */
    }
  }

  async function removeMessageReaction(
    messageId: string,
  ): Promise<void> {
    try {
      await fetch(`/api/messages/${messageId}/reaction?userId=${userId}`, {
        method: 'DELETE',
      });
    } catch {
      /* ignore */
    }
  }

  async function handleReaction(
    message: ChatMessage,
    type: 'up' | 'down' | 'heart',
  ): Promise<void> {
    if (message.reaction?.type === type) {
      message.reaction = null;
      await removeMessageReaction(message.id);
      toast.success('Reaction removed');
      return;
    }

    if (type === 'down') {
      message.reaction = { type: 'down', reason: '' };
      return;
    }

    if (type === 'heart') {
      message.reaction = { type: 'heart', reason: '' };
      await setMessageReaction(message.id, 'heart');
      toast.success(`Can't believe someone clicked on this ❤️❤️❤️ Yuh a di best!`);
      return;
    }

    message.reaction = { type: 'up', reason: '' };
    await setMessageReaction(message.id, 'up');
    toast.success('Thanks for the feedback');
  }

  async function submitDownReason(
    message: ChatMessage,
    reason: string,
  ): Promise<void> {
    try {
      const res = await fetch(`/api/messages/${message.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: reason.trim() }),
      });
      if (res.ok) {
        onreport(message.id);
        toast.success('Thanks for the feedback');
      }
    } catch {
      /* ignore */
    }
  }
</script>

<div
  id="msg-{message.id}"
  class="flex animate-message-in {message.role === 'user'
    ? 'justify-end'
    : 'justify-start'}"
>
  <div
    class="shadow-md wrap-break-word max-md:max-w-full {message.role ===
    'assistant'
      ? 'w-full rounded-2xl rounded-bl-sm border-l-3 border-primary/15 p-4 max-sm:p-3'
      : 'max-w-[80%] ml-auto rounded-2xl rounded-br-sm p-4'} {message.role === 'user'
      ? 'bg-surface-container-high'
      : 'bg-surface-container'}{message.error
      ? ' bg-[color-mix(in_srgb,var(--color-secondary)_8%,transparent)] border-2 border-secondary/40'
      : ''}"
  >
    <div class="font-body text-base leading-relaxed"
    class:whitespace-pre-wrap={!message.deletedAt}
    >
      {#if message.deletedAt}
        <div class="flex items-center gap-2 text-outline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          <span class="font-body text-sm">Message deleted</span>
          <span class="font-mono text-xs">· {dayjs.utc(message.deletedAt).fromNow()}</span>
        </div>
      {:else if message.error}
        <!-- Error display as main content -->
        <div class="flex items-start gap-3">
          <div
            class="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/20 text-secondary shrink-0 mt-0.5"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="12" cy="12" r="10" /><line
                x1="12"
                y1="8"
                x2="12"
                y2="12"
              /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-body text-sm font-medium text-gray-200 mb-1">
              Unable to process request
            </p>
            <p class="font-body text-sm text-on-surface-variant">{message.error}</p>
          </div>
          {#if !message.irrecoverable}
            <button
              class="font-body text-xs font-medium text-primary bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] rounded-full px-3 py-1 shrink-0 cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
              onclick={() => onretry()}
              disabled={isLoading}
            >
              Try again
            </button>
          {/if}
        </div>
      {:else if message.role === 'assistant'}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html md.render(preprocessMarkdown(message.text))}
      {:else}
        {message.text}
      {/if}
      {#if message.role === 'assistant' && isLast && isLoading}
        {#if message.text}
          <span class="font-mono text-primary animate-blink select-none" aria-hidden="true">|</span>
        {:else}
          <span class="inline-flex items-center gap-2 text-on-surface-variant italic">
            <span
              class="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary),0_0_16px_rgba(0,255,136,0.3)] animate-pulse-dot"
              aria-hidden="true"
            ></span>
            Thinking...
          </span>
        {/if}
      {/if}
      {#if message.role === 'assistant' && isLast && isLoading && streamingToolValues.length > 0}
        <div class="mt-3 space-y-1">
          {#each streamingToolValues as tool (tool.id)}
            <div
              class="flex items-center gap-2.5 px-3 py-2 rounded-lg border {tool.finishedAt
                ? 'bg-surface-container/20 border-outline-variant/10'
                : 'bg-surface-container/40 border-primary/10'}"
            >
              <!-- Status indicator dot -->
              <span
                class="shrink-0 w-2 h-2 rounded-full {tool.finishedAt
                  ? 'bg-success'
                  : 'bg-warning animate-pulse-dot'}"
                aria-hidden="true"
              ></span>
              <!-- Contextual icon based on tool name -->
              <span class="shrink-0 text-xs"
                >{tool.name.includes('search') || tool.name.includes('fetch')
                  ? '🔍'
                  : tool.name.includes('read') || tool.name.includes('list')
                    ? '📄'
                    : tool.name.includes('write') || tool.name.includes('create')
                      ? '✏️'
                      : '⚙'}</span
              >
              <!-- Tool name -->
              <span class="truncate text-xs font-mono text-on-surface-variant"
                >{tool.serverId}/{tool.name}</span
              >
              <!-- Duration -->
              <span class="tabular-nums text-xs font-mono text-outline/60 ml-auto shrink-0"
                >{formatDuration(
                  (tool.finishedAt ?? now) - tool.startedAt,
                )}</span
              >
              <!-- Status label -->
              <span
                class="text-[10px] font-mono {tool.finishedAt
                  ? 'text-success/60'
                  : 'text-warning'} shrink-0"
                >{tool.finishedAt ? 'done' : '…'}</span
              >
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if !message.deletedAt}
    <!-- Time (user messages) -->
      {#if message.role === 'user'}
        <div class="mt-2 flex justify-end items-center gap-2">
          <span class="font-mono text-xs text-on-surface-variant"
            >{dayjs.utc(message.createdAt || message.timestamp).fromNow()}</span
          >
          <Tooltip text="Copy link" side="bottom" arrow={true}>
            <!-- eslint-disable-next-line svelte/no-useless-children-snippet -->
            {#snippet children()}
              <button
                class="reaction-btn relative"
                onclick={() => copyMessageLink(message.id)}
                aria-label="Copy link to message"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                  />
                  <path
                    d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                  />
                </svg>
              </button>
            {/snippet}
          </Tooltip>
      </div>
    {/if}

    <!-- Reactions -->
    {#if message.role === 'assistant' && !(isLast && isLoading)}
      <div class="flex items-center gap-2 mt-3 pt-2 max-sm:flex-wrap">
        <span class="text-xs text-outline mr-1">Was this helpful?</span>
        <button
          class="reaction-btn"
          class:active={message.reaction?.type === 'up'}
          onclick={() => handleReaction(message, 'up')}
          aria-label="Thumbs up"
          title="Helpful"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={message.reaction?.type === 'up' ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
            />
          </svg>
        </button>
        <button
          class="reaction-btn downvote-btn"
          class:active={message.reaction?.type === 'down'}
          onclick={() => handleReaction(message, 'down')}
          aria-label="Thumbs down"
          title="Not helpful"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={message.reaction?.type === 'down' ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="rotate-180"
          >
            <path
              d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
            />
          </svg>
        </button>
        <button
          class="reaction-btn heart-btn"
          class:active={message.reaction?.type === 'heart'}
          onclick={() => handleReaction(message, 'heart')}
          aria-label="Heart"
          title="Love it"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={message.reaction?.type === 'heart' ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
        </button>
        <span class="flex-1"></span>
        <Tooltip text="Copy as Markdown" side="bottom" arrow={true}>
          <!-- eslint-disable-next-line svelte/no-useless-children-snippet -->
          {#snippet children()}
            <button
              class="reaction-btn relative"
              onclick={() => copyAsMarkdown(message.text)}
              aria-label="Copy as markdown"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </button>
          {/snippet}
        </Tooltip>
        <Tooltip text="Copy link" side="bottom" arrow={true}>
          <!-- eslint-disable-next-line svelte/no-useless-children-snippet -->
          {#snippet children()}
            <button
              class="reaction-btn relative"
              onclick={() => copyMessageLink(message.id)}
              aria-label="Copy link to message"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                />
                <path
                  d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                />
              </svg>
            </button>
          {/snippet}
        </Tooltip>
      </div>

      <!-- Reason input for thumbs down -->
      {#if message.reaction?.type === 'down'}
        <div class="mt-2">
          <div class="flex gap-2">
            <input
              type="text"
              class="reason-input"
              placeholder="What was missing or incorrect?"
              bind:value={message.reaction.reason}
              onkeydown={(e) => {
                if (
                  e.key === 'Enter' &&
                  message.reaction?.reason.trim() &&
                  message.reaction.reason !== message.savedReason
                ) {
                  submitDownReason(message, message.reaction.reason);
                }
              }}
            />
            <button
              class="reason-submit"
              disabled={!message.reaction?.reason.trim() ||
                message.reaction.reason === message.savedReason}
              onclick={() => {
                if (
                  message.reaction?.reason.trim() &&
                  message.reaction.reason !== message.savedReason
                ) {
                  submitDownReason(message, message.reaction.reason);
                  const btn = event?.currentTarget as HTMLElement;
                  if (btn) {
                    btn.textContent = 'Saved!';
                    setTimeout(() => {
                      btn.textContent = 'Send';
                    }, 2000);
                  }
                }
              }}
            >
              Send
            </button>
          </div>
        </div>
      {/if}
    {/if}

    <!-- Sources -->
    {#if message.role === 'assistant' && message.sources && message.sources.length > 0}
      <div class="mt-4 pt-3 border-t border-[rgba(255,255,255,0.08)]">
        <p class="sources-heading">Sources</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-0">
          {#each message.sources as source, j (message.id + j)}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              class="source-pill"
              style="--source-color: {scoreColor(source.score)}"
              title={source.title}
            >
              <span class="source-dot" aria-hidden="true"></span>
              {#if getSourceType(source)}
                <span class="source-type-badge" style="--type-color: {getSourceType(source)!.color}">{getSourceType(source)!.letter}</span>
              {/if}
              <span class="flex-1 min-w-0 truncate">{source.title}</span>
              <span class="source-score">{source.score.toFixed(2)}</span>
              <svg
                class="source-ext"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                /><polyline points="15 3 21 3 21 9" /><line
                  x1="10"
                  y1="14"
                  x2="21"
                  y2="3"
                />
              </svg>
            </a>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Duration & Time -->
    {#if message.durationMs}
      <div
        class="mt-3 pt-2 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-end gap-3"
      >
        <span class="font-mono text-xs text-on-surface-variant"
          >{formatDuration(message.durationMs)}</span
        >
        <span class="text-outline">·</span>
        <span class="font-mono text-xs text-on-surface-variant"
          >{dayjs.utc(message.createdAt || message.timestamp).fromNow()}</span
        >
        {#if message.queryType}
          <span class="text-outline">·</span>
          <span class="query-type-badge">{message.queryType}</span>
        {/if}
      </div>
    {/if}

    <!-- Tool calls -->
    {#if message.role === 'assistant' && message.toolCalls?.length}
      <div class="mt-3 pt-2 border-t border-[rgba(255,255,255,0.06)]">
        <div class="flex flex-wrap gap-2">
          {#each groupToolCalls(message.toolCalls || []) as group (group.key)}
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high border border-[rgba(255,255,255,0.08)] text-xs font-mono text-on-surface-variant"
            >
              <span class="text-outline">({group.count})</span>
              ⚙ {group.serverId}/{group.name}
              {#if group.totalDurationMs > 0}
                <span class="text-outline"
                  >{formatDuration(group.totalDurationMs)}</span
                >
              {/if}
            </span>
          {/each}
        </div>
      </div>
    {/if}
    {/if}
  </div>
</div>

<style>
  .source-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 6px 13px;
    border: 1px solid
      color-mix(in srgb, var(--source-color, var(--color-primary)) 30%, transparent);
    border-radius: 9999px;
    background: color-mix(
      in srgb,
      var(--source-color, var(--color-primary)) 6%,
      transparent
    );
    color: var(--color-on-surface, #c0c8d0);
    font-family: var(--font-body, sans-serif);
    font-size: var(--text-xs, 0.75rem);
    text-decoration: none;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;
    line-height: 1.4;
  }

  .source-pill:hover {
    background: color-mix(
      in srgb,
      var(--source-color, var(--color-primary)) 14%,
      transparent
    );
    border-color: var(--source-color, var(--color-primary));
    transform: translateY(-1px);
  }

  .source-pill:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .source-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--source-color, var(--color-primary));
    flex-shrink: 0;
    margin: 4px;
  }

  .sources-heading {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 0.75rem);
    color: var(--color-on-surface-variant, #8090a0);
    margin: 0 0 var(--space-1, 4px);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .source-score {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--source-color, var(--color-primary));
    opacity: 0.8;
    flex-shrink: 0;
  }

  .source-ext {
    flex-shrink: 0;
    color: var(--source-color, var(--color-primary));
    opacity: 0.7;
    transition: opacity 0.15s;
    margin-left: auto;
  }

  .source-pill:hover .source-ext {
    opacity: 1;
  }

  .source-type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    color: var(--type-color, var(--color-on-surface-variant));
    background: color-mix(in srgb, var(--type-color, var(--color-on-surface-variant)) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--type-color, var(--color-on-surface-variant)) 30%, transparent);
    flex-shrink: 0;
  }

  .reaction-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-outline-variant, #2a2a4a);
    border-radius: var(--radius-md, 6px);
    background: transparent;
    color: var(--color-on-surface-variant);
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
    padding: 0;
  }

  .reaction-btn:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .reaction-btn.active {
    color: var(--color-primary);
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .reaction-btn.heart-btn:hover {
    color: var(--color-tertiary);
    border-color: var(--color-tertiary);
  }

  .reaction-btn.heart-btn.active {
    color: var(--color-tertiary);
    border-color: var(--color-tertiary);
    background: color-mix(in srgb, var(--color-tertiary) 10%, transparent);
  }

  .reaction-btn.downvote-btn:hover {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .reaction-btn.downvote-btn.active {
    color: var(--color-error);
    border-color: var(--color-error);
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
  }

  .reason-input {
    flex: 1;
    padding: 6px 10px;
    font-family: var(--font-body, sans-serif);
    font-size: var(--text-xs, 0.75rem);
    background: transparent;
    border: 1px solid var(--color-outline-variant, #2a2a4a);
    border-radius: var(--radius-md, 6px);
    color: var(--color-on-surface, #c0c8d0);
    outline: none;
    transition: border-color 0.15s;
  }

  .reason-input:focus {
    border-color: var(--color-primary);
  }

  .reason-input::placeholder {
    color: var(--color-on-surface-variant, #8090a0);
  }

  .reason-submit {
    padding: 6px 12px;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 0.75rem);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md, 6px);
    color: var(--color-primary);
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .reason-submit:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  .reason-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global([id^='msg-']:target) {
    box-shadow:
      0 0 0 2px var(--color-primary),
      0 0 24px rgba(0, 255, 136, 0.15);
    border-radius: 8px;
    transition: box-shadow 2s ease-out;
  }

  :global([id^='msg-']:target:not(:focus-within)) {
    animation: msg-fade-highlight 3s ease-out forwards;
  }

  @keyframes msg-fade-highlight {
    0% {
      box-shadow:
        0 0 0 2px var(--color-primary),
        0 0 24px rgba(0, 255, 136, 0.15);
    }
    100% {
      box-shadow: none;
    }
  }

  :global(.font-body code) {
    background: rgba(0, 255, 136, 0.08);
    color: #e8e8ee;
    font-family: inherit;
    font-size: 0.875em;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  :global(.font-body pre) {
    background: #2a2a4e;
    color: #e8e8ee;
    border-radius: 6px;
    padding: 1em;
    overflow-x: auto;
    margin: 0.75em 0;
  }

  :global(.font-body pre code) {
    background: none;
    padding: 0;
    font-size: 0.825em;
    font-family: monospace;
  }

  :global(.font-body pre code.hljs) {
    background: none;
    padding: 0;
  }

  :global(.font-body blockquote) {
    border-left: 4px solid rgba(0, 255, 136, 0.3);
    padding-left: 1em;
    color: #9ca3af;
    font-style: italic;
    margin: 0.75em 0;
  }

  :global(.font-body a) {
    color: #00ff88;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :global(li > p) {
    margin: 0;
  }

  :global(.bg-surface-container img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0.5em 0;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }
.query-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
}

</style>
