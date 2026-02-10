const crypto = require('crypto')

/**
 * 对文本内容生成 SHA-256 哈希（用于消息去重）
 * @param {string} text
 * @returns {string} hex hash
 */
function contentHash(text) {
  return crypto.createHash('sha256').update(text.trim()).digest('hex')
}

module.exports = { contentHash }
