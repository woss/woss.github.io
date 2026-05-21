// ============================================================
// getDb — singleton Database connection tests
// ============================================================

import { mock, describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Temp directory isolated from the running app's data/
const tmpDir = mkdtempSync('/tmp/db-test-');
const DB_PATH = join(tmpDir, 'vectors.db');
const DB_WAL_PATH = DB_PATH + '-wal';
const DB_SHM_PATH = DB_PATH + '-shm';
const VECTOR_INDEX_PATH = join(tmpDir, 'vectors.usearch');

// Hoisted by bun — runs before any static imports, intercepts every import
// of the modules used by db.ts so we control paths and native binaries.

// better-sqlite3 is a native C addon — not supported by bun's test runner.
mock.module('better-sqlite3', () => ({
  default: function Database() {
    return {
      prepare: () => ({
        run: () => ({ changes: 1 }),
        get: () => undefined,
        all: () => [],
      }),
      exec: () => {},
      close: () => {},
    };
  },
}));

mock.module('./schema.ts', () => ({
  DATA_DIR: tmpDir,
  DB_PATH,
  DB_WAL_PATH,
  DB_SHM_PATH,
  VECTOR_INDEX_PATH,
  initDatabase: (db: { exec: (sql: string) => void }) => {
    db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY)');
  },
}));

interface DbModule {
  getDb(): import('better-sqlite3').Database;
  closeDb(): void;
  resetDatabase(): void;
}

let mod: DbModule;

describe('getDb', () => {
  beforeAll(async () => {
    const m = await import('./db.ts');
    mod = m as unknown as DbModule;
  });

  beforeEach(() => {
    mod.resetDatabase();
  });

  afterAll(() => {
    mod.closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a Database instance', () => {
    const db = mod.getDb();
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe('function');
  });

  it('returns the same instance on second call', () => {
    const a = mod.getDb();
    const b = mod.getDb();
    expect(a).toBe(b);
  });

  it('creates data directory if missing', () => {
    rmSync(tmpDir, { recursive: true, force: true });
    expect(existsSync(tmpDir)).toBe(false);

    mod.getDb();

    expect(existsSync(tmpDir)).toBe(true);
  });

  it('cleans up stale WAL files when DB missing', () => {
    // resetDatabase already clears DB file. Create stale WAL without DB.
    writeFileSync(DB_WAL_PATH, '', 'utf-8');
    expect(existsSync(DB_WAL_PATH)).toBe(true);
    expect(existsSync(DB_PATH)).toBe(false);

    mod.getDb();

    expect(existsSync(DB_WAL_PATH)).toBe(false);
  });

  it('creates a new instance after closeDb', () => {
    const a = mod.getDb();
    mod.closeDb();
    const b = mod.getDb();
    expect(a).not.toBe(b);
  });
});
