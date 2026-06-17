-- ============================================================
-- woss.io Full Database Schema
-- Run: sqlite3 data/woss.db < src/scripts/migrate.sql
-- ============================================================
-- Chunks: content chunks for RAG
CREATE TABLE
  IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id TEXT UNIQUE,
    text TEXT,
    title TEXT,
    date TEXT,
    tags TEXT,
    section TEXT,
    embedding TEXT,
    type TEXT
  );

-- Users: application users
CREATE TABLE
  IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    created_at TEXT DEFAULT (datetime ('now'))
  );

-- Messages: chat messages
CREATE TABLE
  IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chat_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT DEFAULT '[]',
    reasoning TEXT DEFAULT '',
    error TEXT,
    irrecoverable INTEGER DEFAULT 0,
    query_type TEXT,
    created_at TEXT DEFAULT (datetime ('now')),
    model_id INTEGER,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    max_tokens INTEGER DEFAULT 0,
    deleted_at TEXT,
    user_agent_id INTEGER,
    trace_id TEXT
  );

-- Page posts: blog/content pages
CREATE TABLE
  IF NOT EXISTS page_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    hash TEXT,
    content TEXT,
    toc TEXT,
    title TEXT,
    description TEXT,
    date TEXT,
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    excerpt TEXT,
    header_image TEXT,
    featured INTEGER DEFAULT 0,
    position INTEGER,
    part_of_series INTEGER REFERENCES page_posts(id),
    updated_at TEXT
  );

-- Page experience: work experience entries
CREATE TABLE
  IF NOT EXISTS page_experience (
    slug TEXT PRIMARY KEY,
    hash TEXT,
    content TEXT,
    company TEXT,
    role TEXT,
    start_date TEXT,
    end_date TEXT,
    duration TEXT,
    skills TEXT,
    description TEXT,
    published INTEGER DEFAULT 1,
    updated_at TEXT
  );

-- LLM cache: cached LLM responses
CREATE TABLE
  IF NOT EXISTS llm_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    question_embedding TEXT,
    answer TEXT,
    sources TEXT,
    message_id TEXT,
    created_at TEXT DEFAULT (datetime ('now'))
  );

-- Models: available LLM models
CREATE TABLE
  IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT,
    model_name TEXT,
    actual_model_name TEXT,
    max_tokens INTEGER,
    UNIQUE (provider, model_name, actual_model_name)
  );

-- Reactions: user reactions to messages
CREATE TABLE
  IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    user_id TEXT,
    reaction_type TEXT,
    reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime ('now')),
    UNIQUE (message_id, user_id)
  );

-- Chats: chat conversations
CREATE TABLE
  IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT DEFAULT 'New Chat',
    created_at TEXT DEFAULT (datetime ('now')),
    deleted_at TEXT,
    locked INTEGER DEFAULT 0,
    off_topic_count INTEGER DEFAULT 0,
    user_agent_id INTEGER,
    trace_id TEXT
  );

-- Chat events: event log for chat sessions
CREATE TABLE
  IF NOT EXISTS chat_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    type TEXT,
    data TEXT,
    created_at TEXT DEFAULT (datetime ('now'))
  );

-- Leads: contact form submissions
CREATE TABLE
  IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    name TEXT,
    email TEXT,
    company_name TEXT,
    role TEXT,
    message TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime ('now'))
  );

-- Contact intents: user intent to contact
CREATE TABLE
  IF NOT EXISTS contact_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    chat_id TEXT,
    text TEXT,
    created_at TEXT DEFAULT (datetime ('now'))
  );

-- User agents: browser/user-agent tracking
CREATE TABLE
  IF NOT EXISTS user_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ua TEXT UNIQUE,
    ip TEXT,
    created_at TEXT DEFAULT (datetime ('now'))
  );

-- Tool calls: LLM tool/function call records
CREATE TABLE
  IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    name TEXT,
    server_id TEXT,
    tool_input TEXT,
    tool_output TEXT,
    result_size INTEGER DEFAULT 0,
    started_at TEXT,
    finished_at TEXT
  );

-- Rate limits: IP-based rate limiting
CREATE TABLE
  IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    timestamp TEXT
  );

-- ============================================================
-- Migrations for existing databases
-- Run these manually if your database was created before these
-- columns existed. CREATE TABLE IF NOT EXISTS won't add them.
-- ============================================================

ALTER TABLE messages ADD COLUMN irrecoverable INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN trace_id TEXT;
ALTER TABLE chats ADD COLUMN trace_id TEXT;
ALTER TABLE page_posts ADD COLUMN workflow_files TEXT;

