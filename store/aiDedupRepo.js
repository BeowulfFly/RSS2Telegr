const logger = require('../utils/logger')

/**
 * AI 去重记录存储 — 保存被识别为相同事件的消息对比
 */
class AiDedupRepo {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db

    this._insert = db.prepare(`
      INSERT INTO ai_dedup_groups (kept_content, kept_source, removed_content, removed_source, similarity_reason)
      VALUES (@keptContent, @keptSource, @removedContent, @removedSource, @reason)
    `)

    this._getRecent = db.prepare(`
      SELECT * FROM ai_dedup_groups ORDER BY created_at DESC LIMIT ?
    `)

    this._getToday = db.prepare(`
      SELECT * FROM ai_dedup_groups WHERE date(created_at) = date('now') ORDER BY created_at DESC
    `)

    this._countToday = db.prepare(`
      SELECT COUNT(*) as count FROM ai_dedup_groups WHERE date(created_at) = date('now')
    `)
  }

  /** 保存一条去重记录 */
  save({ keptMsg, removedMsg, reason }) {
    return this._insert.run({
      keptContent: keptMsg.content,
      keptSource: keptMsg.source || '未知',
      removedContent: removedMsg.content,
      removedSource: removedMsg.source || '未知',
      reason: reason || '',
    })
  }

  /** 批量保存 */
  saveMany(records) {
    const tx = this.db.transaction((items) => {
      for (const item of items) {
        this.save(item)
      }
    })
    return tx(records)
  }

  /** 获取最近 N 条去重记录 */
  getRecent(limit = 10) {
    return this._getRecent.all(limit)
  }

  /** 获取今日去重记录 */
  getToday() {
    return this._getToday.all()
  }

  /** 今日去重数量 */
  countToday() {
    return this._countToday.get().count
  }

  /** 清除所有记录 */
  clearAll() {
    return this.db.prepare('DELETE FROM ai_dedup_groups').run()
  }
}

module.exports = AiDedupRepo
