export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS agents (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    personality TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    telegram_bot_token TEXT NOT NULL DEFAULT '',
    encrypted_bot_token TEXT,
    secrets TEXT NOT NULL DEFAULT '[]',
    capabilities TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    enabled INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS pending_agents (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    personality TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    capabilities TEXT NOT NULL DEFAULT '[]',
    proposed_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_name) REFERENCES agents(name)
  )`,

  `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    input_schema TEXT NOT NULL DEFAULT '{}',
    code_hash TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('sandbox', 'trusted')) DEFAULT 'sandbox',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    FOREIGN KEY (agent_name) REFERENCES agents(name),
    UNIQUE(agent_name, name)
  )`,

  `CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    description TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_name) REFERENCES agents(name)
  )`,

  `CREATE TABLE IF NOT EXISTS delegations (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    task TEXT NOT NULL,
    result TEXT,
    success INTEGER,
    duration_ms INTEGER,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (from_agent) REFERENCES agents(name),
    FOREIGN KEY (to_agent) REFERENCES agents(name)
  )`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_name, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills(agent_name)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_agent ON scheduled_tasks(agent_name)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_name, timestamp)`,

  // Incremental migration: add encrypted_bot_token if upgrading from older schema
  `ALTER TABLE agents ADD COLUMN encrypted_bot_token TEXT`,

  // Long-term memory store
  `CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL CHECK (memory_type IN ('fact', 'summary', 'preference', 'event')),
    importance REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT,
    FOREIGN KEY (agent_name) REFERENCES agents(name)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_name)`,
];
