const { chat } = require('./index')
const { dailyDigestPrompt } = require('./prompt')
const logger = require('../utils/logger')

/**
 * 生成今日整体总结（约300字）
 * @param {Array} messages - 今日消息数组
 * @returns {string} 整体总结文本
 */
async function generateDailyDigest(messages) {
  if (!messages || messages.length === 0) {
    return null
  }

  // 构建消息文本（简化格式，减少 token）
  const messagesText = messages.map((m, i) => {
    const cat = m.category || '未分类'
    const content = m.content.substring(0, 200) // 限制每条消息长度
    return `[${cat}] ${content}`
  }).join('\n\n')

  try {
    const prompt = dailyDigestPrompt(messagesText, messages.length)
    const digest = await chat(prompt, { maxTokens: 800 })
    logger.info({ messageCount: messages.length }, '今日整体总结生成完成')
    return digest
  } catch (err) {
    logger.error({ err }, '生成今日整体总结失败')
    return null
  }
}

module.exports = { generateDailyDigest }
