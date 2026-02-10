const { contentHash } = require('../utils/hash')

class MessageRepo {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db

    // 预编译常用语句
    this._insert = db.prepare(`
      INSERT OR IGNORE INTO messages (source, message_id, content, content_hash, category, ai_score, url, media_path)
      VALUES (@source, @messageId, @content, @contentHash, @category, @aiScore, @url, @mediaPath)
    `)
    this._existsByHash = db.prepare('SELECT 1 FROM messages WHERE content_hash = ?')
    this._todayMessages = db.prepare(`
      SELECT * FROM messages
      WHERE date(created_at) = date('now')
      ORDER BY created_at DESC
    `)
    this._messagesByDate = db.prepare(`
      SELECT * FROM messages
      WHERE date(created_at) = date(?)
      ORDER BY created_at DESC
    `)
    this._recentMessages = db.prepare(`
      SELECT * FROM messages ORDER BY created_at DESC LIMIT ?
    `)
    this._countToday = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE date(created_at) = date('now')
    `)
  }

  /** 保存消息（自动去重，重复则忽略） */
  save(msg) {
    const hash = contentHash(msg.content)
    return this._insert.run({
      source: msg.source || '',
      messageId: msg.messageId || 0,
      content: msg.content,
      contentHash: hash,
      category: msg.category || '',
      aiScore: msg.aiScore || 0,
      url: msg.url || '',
      mediaPath: msg.mediaPath || '',
    })
  }

  /** 批量保存 */
  saveMany(messages) {
    const tx = this.db.transaction((msgs) => {
      for (const msg of msgs) {
        this.save(msg)
      }
    })
    return tx(messages)
  }

  /** 检查内容是否已存在（用于去重） */
  exists(content) {
    const hash = contentHash(content)
    return !!this._existsByHash.get(hash)
  }

  /** 获取今日所有消息 */
  getToday() {
    return this._todayMessages.all()
  }

  /** 获取指定日期的消息 */
  getByDate(dateStr) {
    return this._messagesByDate.all(dateStr)
  }

  /** 获取最近 N 条消息 */
  getRecent(limit = 50) {
    return this._recentMessages.all(limit)
  }

  /** 获取今日消息数 */
  countToday() {
    return this._countToday.get().count
  }

  /** 更新消息分类 */
  updateCategory(id, category, aiScore = 0) {
    this.db.prepare('UPDATE messages SET category = ?, ai_score = ? WHERE id = ?').run(category, aiScore, id)
  }

  /** 清除所有消息 */
  clearAll() {
    return this.db.prepare('DELETE FROM messages').run()
  }

  /** 清除指定日期之前的消息 */
  clearBefore(dateStr) {
    return this.db.prepare('DELETE FROM messages WHERE date(created_at) < date(?)').run(dateStr)
  }

  /** 清除指定日期的消息 */
  clearByDate(dateStr) {
    return this.db.prepare('DELETE FROM messages WHERE date(created_at) = date(?)').run(dateStr)
  }

  /** 获取消息总数 */
  countAll() {
    return this.db.prepare('SELECT COUNT(*) as count FROM messages').get().count
  }

  /** 根据 ID 获取单条消息 */
  getById(id) {
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
  }

  /**
   * 关键词搜索消息
   * @param {string[]} keywords - 关键词数组
   * @param {string} mode - 'or'（任意匹配）或 'and'（全部匹配）
   * @param {number} limit - 最大返回条数
   * @returns {Array} 匹配的消息
   */
  search(keywords, mode = 'or', limit = 20) {
    if (!keywords || keywords.length === 0) return []

    // 构建 LIKE 条件
    const conditions = keywords.map(() => 'content LIKE ?')
    const connector = mode === 'and' ? ' AND ' : ' OR '
    const whereClause = conditions.join(connector)

    const sql = `
      SELECT * FROM messages
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `

    // 构建参数（每个关键词加 % 通配符）
    const params = keywords.map(kw => `%${kw}%`)
    params.push(limit)

    return this.db.prepare(sql).all(...params)
  }
}

module.exports = MessageRepo
