const Database = require('better-sqlite3')
const path = require('path')
const logger = require('../utils/logger')

const DB_PATH = path.join(__dirname, '..', 'data.db')

/** 初始化数据库，创建表结构 */
function initDB() {
  const db = new Database(DB_PATH)

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL')

  // 消息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source        TEXT    NOT NULL,
      message_id    INTEGER,
      content       TEXT    NOT NULL,
      content_hash  TEXT    NOT NULL,
      category      TEXT    DEFAULT '',
      ai_score      REAL    DEFAULT 0,
      url           TEXT    DEFAULT '',
      media_path    TEXT    DEFAULT '',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(content_hash)
    )
  `)

  // 添加 media_path 列（如果不存在）
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN media_path TEXT DEFAULT ''`)
  } catch {
    // 列已存在，忽略
  }

  // 为去重查询加索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_hash ON messages(content_hash)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(created_at)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(category)
  `)

  // 每日总结表
  db.exec(`
    CREATE TABLE IF NOT EXISTS summaries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL UNIQUE,
      content     TEXT    NOT NULL,
      categories  TEXT    DEFAULT '{}',
      msg_count   INTEGER DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // AI 去重记录表（存储相同事件的消息组）
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_dedup_groups (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      kept_content        TEXT    NOT NULL,
      kept_source         TEXT    NOT NULL,
      removed_content     TEXT    NOT NULL,
      removed_source      TEXT    NOT NULL,
      similarity_reason   TEXT    DEFAULT '',
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_dedup_date ON ai_dedup_groups(created_at)
  `)

  logger.info('数据库初始化完成')
  return db
}

module.exports = { initDB }
