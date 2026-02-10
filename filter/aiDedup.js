const { aiDedup } = require('../ai/deduplicator')
const logger = require('../utils/logger')

/**
 * AI 事件去重过滤器
 * @param {Array} messages - 消息数组
 * @param {import('../store/aiDedupRepo')} aiDedupRepo - 去重记录存储
 * @returns {Promise<Array>} 过滤后的消息
 */
async function aiDedupFilter(messages, aiDedupRepo) {
  const before = messages.length
  const result = await aiDedup(messages, aiDedupRepo)
  const removed = before - result.length

  if (removed > 0) {
    logger.info({ removed }, `AI 事件去重: 移除 ${removed} 条重复事件消息`)
  }

  return result
}

module.exports = aiDedupFilter
