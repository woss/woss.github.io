import { join } from 'node:path';
import { createLogger, CAT } from './logger';

export const DATA_DIR = join(process.cwd(), 'data');
export const DB_PATH = join(DATA_DIR, 'vectors.db');
export const DB_WAL_PATH = DB_PATH + '-wal';
export const DB_SHM_PATH = DB_PATH + '-shm';
export const VECTOR_INDEX_PATH = join(DATA_DIR, 'vectors.usearch');

const log = createLogger(CAT.db);

/**
 * All CREATE TABLE and CREATE INDEX statements.
 * Idempotent — uses IF NOT EXISTS throughout.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id TEXT UNIQUE NOT NULL,
  text TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  date TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  section TEXT NOT NULL DEFAULT '',
  embedding TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL DEFAULT 'post'
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

CREATE TABLE IF NOT EXISTS page_content (
  slug TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  hash TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  actual_model_name TEXT NOT NULL,
  max_tokens INTEGER NOT NULL,
  UNIQUE(provider, model_name, actual_model_name)
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK(reaction_type IN ('up', 'down', 'heart')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id)
);
`;

/**
 * Run all schema creation and migrations.
 * Takes `any` type since both better-sqlite3 and bun:sqlite have the same method API
 * (exec, prepare, run, get, all, transaction).
 * Safe to call on every app start — all DDL uses IF NOT EXISTS,
 * all ALTER TABLEs are wrapped in try/catch.
 */
interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}

export function initDatabase(db: Database): void {
  // 1. Base schema
  db.exec(SCHEMA_SQL);

  // 2. Column migrations (added incrementally as features grew)
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE chunks ADD COLUMN type TEXT NOT NULL DEFAULT 'post'`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN reasoning TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN tokens_in INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN tokens_out INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN model_id INTEGER`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN max_tokens INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }

  // 3. Chats table migration
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL DEFAULT 'New Chat',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
    `);
  } catch {
    /* exists */
  }

  try {
    db.exec(`ALTER TABLE messages ADD COLUMN chat_id TEXT REFERENCES chats(id)`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE chats ADD COLUMN deleted_at DATETIME DEFAULT NULL`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN deleted_at DATETIME DEFAULT NULL`);
  } catch {
    /* exists */
  }

  // 4. Chat events table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL REFERENCES chats(id),
        type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chat_events_chat_id ON chat_events(chat_id);
    `);
  } catch {
    /* exists */
  }

  // 5. Leads table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        ip_address TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
    `);
  } catch {
    /* exists */
  }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN company_name TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN role TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* exists */
  }

  // 6. Contact intents table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contact_intents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        chat_id TEXT NOT NULL REFERENCES chats(id),
        text TEXT NOT NULL,
        detected_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_contact_intents_user_id ON contact_intents(user_id);
    `);
  } catch {
    /* exists */
  }

  // 7. Backfill: messages with NULL chat_id get grouped into chats by user
  try {
    const nullMessages = db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE chat_id IS NULL`).get() as {
      count: number;
    };
    if (nullMessages.count > 0) {
      const userRows = db.prepare(`SELECT DISTINCT user_id FROM messages WHERE chat_id IS NULL`).all() as {
        user_id: string;
      }[];
      for (const row of userRows) {
        const userId = row.user_id;
        const firstMsg = db
          .prepare(`SELECT content FROM messages WHERE user_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
          .get(userId) as { content: string } | undefined;
        const title = firstMsg ? firstMsg.content.slice(0, 40) : 'General';
        const chatId = crypto.randomUUID();
        db.prepare(`INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)`).run(chatId, userId, title);
        db.prepare(`UPDATE messages SET chat_id = ? WHERE user_id = ? AND chat_id IS NULL`).run(chatId, userId);
      }
    }
  } catch (err) {
    log.error`Backfill migration failed: ${err}`;
  }

  // 8. llm_cache.message_id column
  try {
    db.exec(`ALTER TABLE llm_cache ADD COLUMN message_id TEXT DEFAULT NULL`);
  } catch {
    /* exists */
  }

  // 9. Chat locking (relevance gate rejection)
  try {
    db.exec(`ALTER TABLE chats ADD COLUMN locked INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }

  // 10. Error column for assistant error messages (traceability)
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN error TEXT DEFAULT NULL`);
  } catch {
    /* exists */
  }

  // 11. irrecoverable flag on error messages (prevents recovery/regeneration)
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN irrecoverable INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }

  // 12. User-agent tracking (normalized table + FK on messages and chats)
  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS user_agents (id INTEGER PRIMARY KEY AUTOINCREMENT, ua TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    );
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN user_agent_id INTEGER REFERENCES user_agents(id)`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE chats ADD COLUMN user_agent_id INTEGER REFERENCES user_agents(id)`);
  } catch {
    /* exists */
  }

  // 13. IP + Country columns on user_agents (GeoIP lookup)
  try {
    db.exec(`ALTER TABLE user_agents ADD COLUMN ip TEXT DEFAULT NULL`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE user_agents ADD COLUMN country TEXT DEFAULT NULL`);
  } catch {
    /* exists */
  }

  // 14. Tool calls table (per-tool timing — FK to messages)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        name TEXT NOT NULL,
        server_id TEXT NOT NULL DEFAULT '',
        input TEXT NOT NULL DEFAULT '{}',
        result_size INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id ON tool_calls(message_id);
    `);
  } catch {
    /* exists */
  }

  // 15. Rate limiter table (persistent per-IP request tracking)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip);
    `);
  } catch {
    /* exists */
  }

  // 16. Reactions CHECK constraint — add 'heart' to allowed reaction types.
  //     SQLite cannot alter CHECK constraints, so we recreate the table.
  try {
    // Detect old schema by attempting INSERT with 'heart' — fails if constraint too strict.
    db.prepare(`INSERT INTO reactions (message_id, user_id, reaction_type) VALUES ('__migrate_test__', '__migrate_test__', 'heart')`).run();
    // If we get here, schema already supports 'heart' — clean up test row.
    db.prepare(`DELETE FROM reactions WHERE message_id = '__migrate_test__' AND user_id = '__migrate_test__'`).run();
  } catch {
    // Old constraint — recreate table with 'heart' included
    db.exec(`
      CREATE TABLE IF NOT EXISTS reactions_new (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        reaction_type TEXT NOT NULL CHECK(reaction_type IN ('up', 'down', 'heart')),
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (message_id, user_id)
      );
      INSERT INTO reactions_new (message_id, user_id, reaction_type, reason, created_at)
        SELECT message_id, user_id, reaction_type, reason, created_at FROM reactions;
      DROP TABLE reactions;
      ALTER TABLE reactions_new RENAME TO reactions;
    `);
  }

  // 17. Merge content_files into page_content — add hash column, drop content_files
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN hash TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`UPDATE page_content SET hash = (SELECT cf.hash FROM content_files cf WHERE cf.slug = page_content.slug)`);
  } catch {
    /* content_files might not exist already */
  }
  try {
    db.exec(`DROP TABLE IF EXISTS content_files`);
  } catch {
    /* already dropped */
  }

  // 18. Featured flag on page_content (for homepage cards)
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* exists */
  }

  // 19. TOC column on page_content (table of contents for blog posts)
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN toc TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    /* exists */
  }

  // 20. Extract meta keys to dedicated columns on page_content
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN title TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN description TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN date TEXT`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN published INTEGER NOT NULL DEFAULT 1`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN excerpt TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN header_image TEXT NOT NULL DEFAULT 'null'`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN position INTEGER`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN company TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN role TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN start_date TEXT`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN end_date TEXT`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN duration TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    db.exec(`ALTER TABLE page_content ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* exists */ }
}
