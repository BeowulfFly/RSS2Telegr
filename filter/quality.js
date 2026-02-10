const config = require('../config')
const logger = require('../utils/logger')

/**
 * 质量过滤器 — 过滤掉过短、纯表情、垃圾信息等
 * @param {Array} messages
 * @returns {Array}
 */
function qualityFilter(messages) {
  const minLen = config.filter.minLength

  return messages.filter(msg => {
    const text = msg.content.trim()

    // 长度过滤
    if (text.length < minLen) {
      logger.debug({ len: text.length, minLen }, '消息过短被过滤')
      return false
    }

    // 纯链接过滤（只有 URL 没有正文）
    const urlOnly = /^https?:\/\/\S+$/i.test(text)
    if (urlOnly) {
      logger.debug('纯链接消息被过滤')
      return false
    }

    return true
  })
}

module.exports = qualityFilter
