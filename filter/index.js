const dedup = require('./dedup')
const keywordFilter = require('./keyword')
const qualityFilter = require('./quality')
const aiDedupFilter = require('./aiDedup')
const logger = require('../utils/logger')

/**
 * 过滤管线 — 按顺序执行各过滤步骤（异步，支持 AI 去重）
 * @param {Array} messages - 原始消息数组
 * @param {import('../store/messageRepo')} messageRepo - 用于去重查询
 * @param {import('../store/aiDedupRepo')} aiDedupRepo - AI 去重记录存储（可选）
 * @returns {Promise<Array>} 通过所有过滤的消息
 */
async function filterPipeline(messages, messageRepo, aiDedupRepo = null) {
  const before = messages.length

  let result = messages
  result = dedup(result, messageRepo)       // 1. hash 去重
  result = keywordFilter(result)            // 2. 关键词筛选
  result = qualityFilter(result)            // 3. 质量过滤

  // 4. AI 事件去重（可选，需要传入 aiDedupRepo）
  if (aiDedupRepo && result.length >= 2) {
    result = await aiDedupFilter(result, aiDedupRepo)
  }

  logger.info({ before, after: result.length }, `过滤管线: ${before} → ${result.length} 条消息`)
  return result
}

module.exports = { filterPipeline }
