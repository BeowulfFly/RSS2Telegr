const dedup = require('./dedup')
const keywordFilter = require('./keyword')
const qualityFilter = require('./quality')
const logger = require('../utils/logger')

/**
 * 过滤管线 — 按顺序执行各过滤步骤
 * @param {Array} messages - 原始消息数组
 * @param {import('../store/messageRepo')} messageRepo - 用于去重查询
 * @returns {Array} 通过所有过滤的消息
 */
function filterPipeline(messages, messageRepo) {
  const before = messages.length

  let result = messages
  result = dedup(result, messageRepo)       // 1. 去重
  result = keywordFilter(result)            // 2. 关键词筛选
  result = qualityFilter(result)            // 3. 质量过滤

  logger.info({ before, after: result.length }, `过滤管线: ${before} → ${result.length} 条消息`)
  return result
}

module.exports = { filterPipeline }
