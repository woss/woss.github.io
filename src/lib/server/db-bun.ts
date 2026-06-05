import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { initDatabase, DATA_DIR, DB_PATH, DB_WAL_PATH, DB_SHM_PATH, VECTOR_INDEX_PATH } from './schema';

let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Delete stale WAL/SHM journal files when DB is missing — prevents SQLITE_IOERR_SHORT_READ
  if (!existsSync(DB_PATH)) {
    try {
      if (existsSync(DB_WAL_PATH)) unlinkSync(DB_WAL_PATH);
    } catch { /* ignore - file may not exist */ }
    try {
      if (existsSync(DB_SHM_PATH)) unlinkSync(DB_SHM_PATH);
    } catch { /* ignore - file may not exist */ }
  }

  const db = new Database(DB_PATH);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  initDatabase(db);

  _db = db;
  return db;
}

function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function resetDatabase(): void {
  closeDb();
  // Delete vector index only — preserves user data in SQLite
  try {
    if (existsSync(VECTOR_INDEX_PATH)) unlinkSync(VECTOR_INDEX_PATH);
  } catch { /* ignore - file may not exist */ }
  // Reopen DB to drop search tables (user data preserved)
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('DROP TABLE IF EXISTS chunks');
  db.exec('DROP TABLE IF EXISTS page_posts');
  db.exec('DROP TABLE IF EXISTS page_experience');
  db.exec('DROP TABLE IF EXISTS page_content');
  db.close();
}

export { getDb, closeDb, resetDatabase };
