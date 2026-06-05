import 'dotenv/config';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import GithubSlugger from 'github-slugger';
import { Index } from 'usearch';
import { parseFrontmatter } from '../content/index.ts';
import { SEARCH_INDEX_CONFIG } from '../lib/search-config.ts';
import { closeDb, getDb, resetDatabase } from '../lib/server/db-bun.ts';
import { embedTexts, releaseExtractor } from '../lib/server/embed.ts';
import { chunkContent } from './chunk-content.ts';
import { initLogger, CAT, createLogger } from '../lib/server/logger.ts';
import { centroidDataChanged, embedAndComputeCentroids, saveCentroids } from './seed-data.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = './data';
const INDEX_PATH = `${DATA_DIR}/vectors.usearch`;

const POSTS_DIR = join(process.cwd(), 'src', 'content', 'posts');
const EXPERIENCE_DIR = join(process.cwd(), 'src', 'content', 'experience');

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const update = args.includes('--update');

await initLogger((process.env.LOG_LEVEL as 'trace' | 'debug' | 'info' | 'warning' | 'error') || 'info');
const log = createLogger(CAT.search);

if (reset) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('WARNING: This will delete all search index data (chunks, page_content, vector index). User data (chats, messages) will NOT be affected. Continue? [y/N] ', resolve);
  });
  rl.close();
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    log.info`Reset cancelled.`;
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentItem {
  slug: string;
  title: string;
  date: string | null;
  tags: string[];
  body: string;
  type: 'post' | 'experience';
}

export interface ChunkRow {
  chunkId: string;
  text: string;
  title: string;
  date: string | null;
  tags: string[];
  section: string;
  embedding: number[];
  type: string;
}

export interface ProcessResult {
  rows: ChunkRow[];
  indexKeys: bigint[];
}

interface FileEntry {
  slug: string;
  type: 'post' | 'experience';
  hash: string;
}

/**
 * Safely parse unknown SQL rows with slug/hash shape.
 * @param rows The raw rows from the database.
 * @returns An array of safe slug/hash pairs.
 */
function parseSlugHashRows(rows: unknown[]): { slug: string; hash: string }[] {
  const parsed: { slug: string; hash: string }[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    parsed.push({ slug: String(Reflect.get(row, 'slug') ?? ''), hash: String(Reflect.get(row, 'hash') ?? '') });
  }
  return parsed;
}

/**
 * Safely coerce an unknown value from JSON parse to a number array.
 * @param value The parsed JSON value.
 * @returns A number array.
 */
function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) out.push(Number(v));
  return out;
}

/**
 * Generate a unique chunk ID based on the file slug and chunk index. This ensures stable IDs across runs for unchanged files, which allows us to skip re-indexing unchanged content.
 * @param slug The slug of the content item.
 * @param index The index of the chunk within the content item.
 * @returns A unique chunk ID.
 */
function generateChunkId(slug: string, index: number): string {
  return `${slug}_chunk_${index}`;
}

/**
 * Extract table of contents entries from raw markdown content.
 * Uses GitHub-slugger algorithm to match rehype-slug's ID generation.
 */
function extractToc(content: string): { id: string; text: string; level: number }[] {
  const slugger = new GithubSlugger();
  const toc: { id: string; text: string; level: number }[] = [];

  // Remove fenced code blocks to avoid false positives
  const withoutCode = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code to avoid false positives
  const withoutInlineCode = withoutCode.replace(/`[^`]+`/g, '');

  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(withoutInlineCode)) !== null) {
    const level = match[1].length; // 2 or 3
    const text = match[2].trim();
    const id = slugger.slug(text);
    toc.push({ id, text, level });
  }

  return toc;
}

/**
 *  Read all markdown files from a directory and return their paths. Returns an empty array if the directory doesn't exist.
 * @param dir The directory to read markdown files from.
 * @returns An array of markdown file paths.
 */
function readMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(dir, f));
}

/**
 * Read all content files and compute per-file SHA-256 hashes.
 * @returns An array of file entries with slug, type, and hash.
 */
function readFileEntries(): FileEntry[] {
  const entries: FileEntry[] = [];

  for (const fp of readMarkdownFiles(POSTS_DIR)) {
    const raw = readFileSync(fp, 'utf-8');
    const slug = fp.split('/').pop()?.replace(/\.md$/, '') || '';
    const hash = createHash('sha256').update(raw).digest('hex');
    entries.push({ slug, type: 'post', hash });
  }

  for (const fp of readMarkdownFiles(EXPERIENCE_DIR)) {
    const raw = readFileSync(fp, 'utf-8');
    const slug = fp.split('/').pop()?.replace(/\.md$/, '') || '';
    const hash = createHash('sha256').update(raw).digest('hex');
    entries.push({ slug, type: 'experience', hash });
  }

  return entries;
}

/**
 * Process one content item through chunk → filter → embed → row-build.
 * Exported for testing. Returns rows for SQLite + keys for USearch.
 * @param file The content item to process.
 * @param chunkOffset The offset to apply to chunk indices for generating unique IDs.
 * @returns An object containing rows for SQLite and keys for USearch.
 */
export async function processFile(file: ContentItem, chunkOffset: number): Promise<ProcessResult> {
  const chunks = await chunkContent(file.body, {
    title: file.title,
    date: file.date,
    tags: file.tags,
  });

  const validChunks = chunks.filter((c) => c.text && c.text.trim());
  if (validChunks.length === 0) return { rows: [], indexKeys: [] };

  const embeddings = await embedTexts(validChunks.map((c) => c.text));

  const rows: ChunkRow[] = [];
  const indexKeys: bigint[] = [];

  for (let i = 0; i < validChunks.length; i++) {
    const chunk = validChunks[i];
    const embedding = embeddings[i];
    rows.push({
      chunkId: generateChunkId(file.slug, i),
      text: chunk.text,
      title: chunk.title || file.title,
      date: chunk.date || file.date,
      tags: chunk.tags?.length ? chunk.tags : file.tags,
      section: chunk.section || '',
      embedding: embedding.data,
      type: file.type,
    });
    indexKeys.push(BigInt(chunkOffset + i + 1));
  }

  return { rows, indexKeys };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function buildIndex(): Promise<void> {
  if (reset) {
    closeDb();
    resetDatabase();
    log.info`Reset: deleted existing database and index`;
  }
  if (await centroidDataChanged(log)) {
    log.info`Computing and saving centroids...`;
    const { toolCentroid, ragCentroid, queries, vectors } = await embedAndComputeCentroids(log);
    await saveCentroids({ toolCentroid, ragCentroid, queries, vectors }, log);
    log.info`Done.`;
  } else {
    log.info`Centroid data unchanged. Skipping centroid computation.`;
  }

  // Free BGE model memory (~1.3GB) before chunk embedding phase
  await releaseExtractor();

  // Retry getDb with backoff — transient IOERR on new DB after reset
  const maxDbInitRetries = 3;
  let db: ReturnType<typeof getDb>;
  for (let dbInitAttempt = 1; ; dbInitAttempt++) {
    try {
      db = getDb();
      break;
    } catch (err) {
      if (dbInitAttempt >= maxDbInitRetries || !(err instanceof Error && err.message.includes('IOERR_SHORT_READ'))) {
        throw err;
      }
      log.debug`getDb attempt ${dbInitAttempt} failed (IOERR_SHORT_READ), retrying...`;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // 1. Read all content files with per-file SHA-256 hashes
  const fileEntries = readFileEntries();

  if (fileEntries.length === 0) {
    log.info`No content files found in src/content/posts/ or src/content/experience/`;
    closeDb();
    return;
  }

  log.info`Content files: ${fileEntries.length}`;

  // 2. Read stored hashes from previous build
  const storedHashes = new Map<string, string>();
  for (const row of parseSlugHashRows(db.prepare('SELECT slug, hash FROM page_posts').all())) {
    storedHashes.set(row.slug, row.hash);
  }
  for (const row of parseSlugHashRows(db.prepare('SELECT slug, hash FROM page_experience').all())) {
    storedHashes.set(row.slug, row.hash);
  }

  // 3. Compare — only unchanged files can be skipped
  const changedEntries: FileEntry[] = [];
  const removedSlugs: string[] = [];
  const currentSlugs = new Set(fileEntries.map((e) => e.slug));

  for (const entry of fileEntries) {
    if (update) {
      changedEntries.push(entry);
    } else {
      const stored = storedHashes.get(entry.slug);
      if (stored !== entry.hash) {
        changedEntries.push(entry);
      }
    }
  }

  for (const [slug] of storedHashes) {
    if (!currentSlugs.has(slug)) {
      removedSlugs.push(slug);
    }
  }

  // 4. Early exit if nothing changed and index exists
  if (changedEntries.length === 0 && removedSlugs.length === 0) {
    if (existsSync(INDEX_PATH)) {
      log.info`No content changes detected. Skipping rebuild.`;
      closeDb();
      return;
    }
    log.info`Content unchanged but index file missing. Rebuilding index from database...`;
  } else {
    log.info`Changes: ${changedEntries.length} file(s) ${update ? '(forced update)' : 'modified'}, ${removedSlugs.length} file(s) removed`;
  }

  // 5. Delete obsolete chunks
  const deleteChunks = db.prepare('DELETE FROM chunks WHERE chunk_id LIKE ?');
  const deletePagePost = db.prepare('DELETE FROM page_posts WHERE slug = ?');
  const deletePageExperience = db.prepare('DELETE FROM page_experience WHERE slug = ?');

  for (const entry of changedEntries) {
    deleteChunks.run(`${entry.slug}_chunk_%`);
  }

  for (const slug of removedSlugs) {
    deleteChunks.run(`${slug}_chunk_%`);
    deletePagePost.run(slug);
    deletePageExperience.run(slug);
    log.debug`  removed: ${slug}`;
  }

  // 6. Process changed/new files — chunk, embed, insert, store hash
  const insertChunk = db.prepare(`
    INSERT OR IGNORE INTO chunks (chunk_id, text, title, date, tags, section, embedding, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: ChunkRow[]) => {
    for (const r of rows) {
      insertChunk.run(
        r.chunkId,
        r.text,
        r.title ?? '',
        r.date ?? null,
        JSON.stringify(r.tags ?? []),
        r.section ?? '',
        JSON.stringify(r.embedding),
        r.type,
      );
    }
  });

  let newChunks = 0;

  for (const entry of changedEntries) {
    log.debug`  ${entry.slug}…`;
    try {
      // Re-read file to get parsed content
      const dir = entry.type === 'post' ? POSTS_DIR : EXPERIENCE_DIR;
      const fp = join(dir, `${entry.slug}.md`);
      const raw = readFileSync(fp, 'utf-8');
      const { data, content } = await parseFrontmatter(raw);

      // Parse header_image from markdown link "[alt](url)" into structured object
      if (data.header_image && typeof data.header_image === 'string') {
        const linkMatch = /\[([^\]]*)\]\(([^)]*)\)/.exec(data.header_image);
        data.header_image = linkMatch ? { alt: linkMatch[1], url: linkMatch[2] } : null;
      }

      // Process title, date, tags — handle Date objects from frontmatter
      let title: string;
      let date: string | null;
      let tags: string[];

      if (entry.type === 'post') {
        title = String(data.title ?? '') || entry.slug;
        const rawDate = data.date;
        date = rawDate instanceof Date ? rawDate.toISOString() : (rawDate ? String(rawDate) : null);
        tags = [...new Set(Array.isArray(data.tags) ? data.tags.map(String) : [])];
      } else {
        const company = String(data.company ?? '');
        const role = String(data.role ?? '');
        title = company ? `${company} — ${role}` : entry.slug;
        const rawStartDate = data.startDate;
        date = rawStartDate instanceof Date ? rawStartDate.toISOString() : (rawStartDate ? String(rawStartDate) : null);
        tags = [...new Set(Array.isArray(data.skills) ? data.skills.map(String) : [])];
      }

      // Process date fields that may be Date objects from frontmatter parsing
      let processedStartDate: string | null = null;
      let processedEndDate: string | null = null;
      if (entry.type === 'experience') {
        const rawStart = data.startDate;
        processedStartDate = rawStart instanceof Date ? rawStart.toISOString() : (rawStart ? String(rawStart) : null);
        const rawEnd = data.endDate;
        processedEndDate = rawEnd instanceof Date ? rawEnd.toISOString() : (rawEnd ? String(rawEnd) : null);
      }

      // Save full content to page_posts or page_experience table
      const toc = JSON.stringify(extractToc(content || raw));
      if (entry.type === 'post') {
        db.prepare(
          `INSERT OR REPLACE INTO page_posts (slug, hash, content, toc, title, description, date, tags, published, excerpt, header_image, featured, position, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        ).run(
          entry.slug,
          entry.hash,
          content || raw,
          toc,
          title,
          data.description ?? '',
          date,
          JSON.stringify(tags),
          data.published !== false ? 1 : 0,
          data.excerpt ?? '',
          JSON.stringify(data.header_image ?? null),
          data.featured ? 1 : 0,
          data.position ?? null,
        );
      } else {
        db.prepare(
          `INSERT OR REPLACE INTO page_experience (slug, hash, content, company, role, start_date, end_date, duration, skills, description, published, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        ).run(
          entry.slug,
          entry.hash,
          content || raw,
          data.company ?? '',
          data.role ?? '',
          processedStartDate,
          processedEndDate,
          data.duration ?? '',
          JSON.stringify(data.skills ?? []),
          data.description ?? '',
          data.published !== false ? 1 : 0,
        );
      }
      const item: ContentItem = {
        slug: entry.slug,
        title,
        date,
        tags,
        body: content || raw,
        type: entry.type,
      };

      const { rows } = await processFile(item, 0);
      if (rows.length === 0) {
        log.debug`    ↳ skipped (no valid chunks)`;
        continue;
      }

      insertMany(rows);
      newChunks += rows.length;
      log.debug`    ↳ ${rows.length} chunks indexed`;
    } catch (err) {
      const processErr = err instanceof Error ? err : new Error(String(err));
      log.error`  ⚠ Failed to process ${entry.slug}: ${processErr.message}`;
    }
  }

  // Free BGE model memory before USearch index rebuild
  await releaseExtractor();

  // 8. Rebuild USearch index from all SQLite rows (streaming)
  const index: Index = new Index(SEARCH_INDEX_CONFIG);
  let rowCount = 0;
  const iter: IterableIterator<unknown> = db.prepare('SELECT id, embedding FROM chunks').iterate();
  for (const rawRow of iter) {
    if (typeof rawRow !== 'object' || rawRow === null) continue;
    const id = Number(Reflect.get(rawRow, 'id') ?? 0);
    const embedding = asNumberArray(JSON.parse(String(Reflect.get(rawRow, 'embedding') ?? '[]')));
    index.add(BigInt(id), new Float32Array(embedding));
    rowCount++;
    // Allow GC to reclaim per-row allocations
    if (rowCount % 100 === 0) await Bun.sleep(0);
  }

  if (rowCount === 0) {
    log.debug`No chunks in database. Skipping index save.`;
    closeDb();
    return;
  }

  index.save(INDEX_PATH);

  // Force GC to release native USearch memory immediately — index is persisted to disk
  Bun.gc(true);

  log.info`\nSaved USearch index (${rowCount} vectors) to ${INDEX_PATH}`;
  log.info`${JSON.stringify({
    total: rowCount,
    fileCount: fileEntries.length,
    newChunks,
  })}`;

  closeDb();
}

buildIndex().catch((err) => {
  log.error`Build failed: ${err}`;
  try {
    closeDb();
  } catch {
    /* ignore close errors during crash */
  }
  process.exit(1);
});
