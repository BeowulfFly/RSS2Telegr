const logger = require('../utils/logger')

/**
 * 去重过滤器 — 检查消息是否已存在于数据库中
 * @param {Array} messages - 消息数组
 * @param {import('../store/messageRepo')} messageRepo
 * @returns {Array} 过滤后的消息
 */
function dedup(messages, messageRepo) {
  const result = messages.filter(msg => !messageRepo.exists(msg.content))
  const removed = messages.length - result.length
  if (removed > 0) {
    logger.debug({ removed }, `去重过滤: 移除 ${removed} 条重复消息`)
  }
  return result
}

module.exports = dedup
