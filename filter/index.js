const dedup = require('./dedup')
const keywordFilter = require('./keyword')
const qualityFilter = require('./quality')
const logger = require('../utils/logger')

/**
 * 过滤管线 — 按顺序执行各过滤步骤
 * 注意：AI 事件去重已移至发布前执行（see scheduler/index.js）
 * @param {Array} messages - 原始消息数组
 * @param {import('../store/messageRepo')} messageRepo - 用于去重查询
 * @param {import('../store/aiDedupRepo')} aiDedupRepo - 保留参数兼容旧调用，暂不使用
 * @returns {Promise<Array>} 通过所有过滤的消息
 */
async function filterPipeline(messages, messageRepo, aiDedupRepo = null) {
  const before = messages.length

  let result = messages
  result = dedup(result, messageRepo)       // 1. hash 去重
  result = keywordFilter(result)            // 2. 关键词筛选
  result = qualityFilter(result)            // 3. 质量过滤

  logger.info({ before, after: result.length }, `过滤管线: ${before} → ${result.length} 条消息`)
  return result
}

module.exports = { filterPipeline }
