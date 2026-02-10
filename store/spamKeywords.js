const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

const KEYWORDS_FILE = path.join(__dirname, '..', 'learned-spam-keywords.json')

/** 加载已学习的垃圾关键词 */
function loadLearnedKeywords() {
  try {
    if (fs.existsSync(KEYWORDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'))
      return new Set(data.keywords || [])
    }
  } catch (err) {
    logger.warn({ err }, '加载垃圾关键词失败')
  }
  return new Set()
}

/** 保存学习到的垃圾关键词 */
function saveLearnedKeywords(keywordsSet) {
  try {
    const data = {
      keywords: Array.from(keywordsSet),
      updatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(data, null, 2))
    logger.info({ count: keywordsSet.size }, '垃圾关键词已保存')
  } catch (err) {
    logger.error({ err }, '保存垃圾关键词失败')
  }
}

/** 添加新的垃圾关键词 */
function addSpamKeywords(newKeywords) {
  const existing = loadLearnedKeywords()
  let added = 0
  for (const kw of newKeywords) {
    const trimmed = kw.trim().toLowerCase()
    if (trimmed && !existing.has(trimmed)) {
      existing.add(trimmed)
      added++
    }
  }
  if (added > 0) {
    saveLearnedKeywords(existing)
    logger.info({ added, total: existing.size }, `新增 ${added} 个垃圾关键词`)
  }
  return added
}

/** 获取所有垃圾关键词（包括配置的和学习的） */
function getAllSpamKeywords(configKeywords = []) {
  const learned = loadLearnedKeywords()
  const all = new Set([...configKeywords.map(k => k.toLowerCase()), ...learned])
  return Array.from(all)
}

module.exports = { loadLearnedKeywords, saveLearnedKeywords, addSpamKeywords, getAllSpamKeywords }
