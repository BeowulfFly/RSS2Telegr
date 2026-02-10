class SummaryRepo {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db

    this._insert = db.prepare(`
      INSERT OR REPLACE INTO summaries (date, content, categories, msg_count)
      VALUES (@date, @content, @categories, @msgCount)
    `)
    this._getByDate = db.prepare('SELECT * FROM summaries WHERE date = ?')
    this._getRecent = db.prepare('SELECT * FROM summaries ORDER BY date DESC LIMIT ?')
  }

  /** 保存每日总结 */
  save({ date, content, categories = {}, msgCount = 0 }) {
    return this._insert.run({
      date,
      content,
      categories: JSON.stringify(categories),
      msgCount,
    })
  }

  /** 获取指定日期的总结 */
  getByDate(dateStr) {
    const row = this._getByDate.get(dateStr)
    if (row) row.categories = JSON.parse(row.categories || '{}')
    return row
  }

  /** 获取最近 N 条总结 */
  getRecent(limit = 7) {
    return this._getRecent.all(limit).map(row => {
      row.categories = JSON.parse(row.categories || '{}')
      return row
    })
  }

  /** 清除所有总结 */
  clearAll() {
    return this.db.prepare('DELETE FROM summaries').run()
  }

  /** 清除指定日期之前的总结 */
  clearBefore(dateStr) {
    return this.db.prepare('DELETE FROM summaries WHERE date < ?').run(dateStr)
  }

  /** 清除指定日期的总结 */
  clearByDate(dateStr) {
    return this.db.prepare('DELETE FROM summaries WHERE date = ?').run(dateStr)
  }

  /** 获取总结总数 */
  countAll() {
    return this.db.prepare('SELECT COUNT(*) as count FROM summaries').get().count
  }
}

module.exports = SummaryRepo
