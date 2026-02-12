const { chat } = require('./index')
const config = require('../config')
const logger = require('../utils/logger')

/**
 * 检测文本主要语言是否为英文
 * @param {string} text - 待检测文本
 * @returns {boolean} - true 表示主要为英文
 */
function isEnglishDominant(text) {
  // 移除标点符号和特殊字符
  const cleanText = text.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '')
  
  // 统计中文字符数量
  const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length
  
  // 统计英文字符数量
  const englishChars = (cleanText.match(/[a-zA-Z]/g) || []).length
  
  // 总字符数
  const totalChars = chineseChars + englishChars
  
  if (totalChars === 0) return false
  
  // 计算中文占比
  const chineseRatio = chineseChars / totalChars
  
  // 获取阈值配置（默认 0.2，即中文字符少于 20% 则认为是英文为主）
  const threshold = parseFloat(process.env.TRANSLATION_THRESHOLD) || 0.2
  
  logger.debug({ chineseRatio, threshold, totalChars }, '语言检测结果')
  
  return chineseRatio < threshold
}

/**
 * 使用 AI 将英文文本翻译成中文
 * @param {string} text - 英文文本
 * @returns {Promise<string>} - 翻译后的中文文本
 */
async function translateToZh(text) {
  // 检查是否启用翻译
  const enableTranslation = process.env.ENABLE_TRANSLATION !== 'false'
  if (!enableTranslation) {
    logger.debug('翻译功能已禁用')
    return text
  }
  
  // 检测是否需要翻译
  if (!isEnglishDominant(text)) {
    logger.debug('文本主要为中文，跳过翻译')
    return text
  }
  
  try {
    logger.info('开始翻译英文文本...')
    
    const messages = [
      {
        role: 'system',
        content: '你是一个专业的翻译助手。请将用户提供的英文文本翻译成简体中文。要求：\n1. 保持原文的格式和结构（如换行、列表等）\n2. 翻译要准确、通顺、符合中文表达习惯\n3. 对于专业术语，在首次出现时可以保留英文原文并附上中文翻译\n4. 保留 HTML 标签不要翻译\n5. 只返回翻译结果，不要添加任何解释'
      },
      {
        role: 'user',
        content: text
      }
    ]
    
    const translatedText = await chat(messages, {
      temperature: 0.3,
      maxTokens: 4000
    })
    
    logger.info('翻译完成')
    return translatedText
    
  } catch (err) {
    logger.error({ err }, '翻译失败，返回原文')
    return text // 翻译失败时返回原文
  }
}

/**
 * 批量翻译多条消息
 * @param {Array<{content: string}>} messages - 消息数组
 * @returns {Promise<Array<{content: string}>>} - 翻译后的消息数组
 */
async function translateBatch(messages) {
  const results = []
  
  for (const msg of messages) {
    if (msg.content) {
      const translatedContent = await translateToZh(msg.content)
      results.push({ ...msg, content: translatedContent })
    } else {
      results.push(msg)
    }
  }
  
  return results
}

module.exports = {
  isEnglishDominant,
  translateToZh,
  translateBatch
}
