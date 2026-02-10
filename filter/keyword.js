const config = require('../config')
const logger = require('../utils/logger')
const { getAllSpamKeywords } = require('../store/spamKeywords')

/**
 * 关键词过滤器
 * - 如果配置了 keywords：消息必须包含至少一个关键词才保留
 * - 如果配置了 excludeKeywords：消息包含任意排除词则丢弃
 * - 自动加载学习到的垃圾关键词进行过滤
 * @param {Array} messages
 * @returns {Array}
 */
function keywordFilter(messages) {
  const { keywords, excludeKeywords } = config.filter
  // 合并配置的排除词和学习到的垃圾关键词
  const allExcludeKeywords = getAllSpamKeywords(excludeKeywords)

  return messages.filter(msg => {
    const text = msg.content.toLowerCase()

    // 排除词检查（优先级高，包含学习到的垃圾关键词）
    if (allExcludeKeywords.length > 0) {
      const matchedKeyword = allExcludeKeywords.find(kw => text.includes(kw))
      if (matchedKeyword) {
        logger.debug({ source: msg.source, keyword: matchedKeyword }, '消息被排除词过滤')
        return false
      }
    }

    // 关键词检查（为空则不做限制，全部保留）
    if (keywords.length > 0) {
      const matched = keywords.some(kw => text.includes(kw.toLowerCase()))
      if (!matched) {
        logger.debug({ source: msg.source }, '消息未匹配关键词')
        return false
      }
    }

    return true
  })
}

module.exports = keywordFilter
