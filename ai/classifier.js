const { chat } = require('./index')
const { classifyPrompt } = require('./prompt')
const { retry } = require('../utils/retry')
const logger = require('../utils/logger')

/**
 * 从 AI 返回的文本中提取 JSON 对象
 * 处理 markdown 代码块、多余文字等情况
 */
function extractJSON(text) {
  // 1. 尝试直接解析
  try {
    return JSON.parse(text.trim())
  } catch {
    // 继续尝试其他方式
  }

  // 2. 提取 markdown 代码块中的内容
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // 继续尝试
    }
  }

  // 3. 提取第一个 {...} JSON 对象
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      // 继续尝试
    }
  }

  // 4. 全部失败，返回 null
  return null
}

/**
 * 对单条消息进行 AI 分类
 * @param {string} text - 消息内容
 * @returns {object} { category, label, confidence }
 */
async function classify(text) {
  try {
    const result = await retry(
      () => chat(classifyPrompt(text), { temperature: 0.1, maxTokens: 200 }),
      { retries: 2, label: 'AI分类' }
    )

    // 从返回结果中提取 JSON
    const parsed = extractJSON(result)

    if (!parsed) {
      logger.warn({ result }, 'AI 返回无法解析为 JSON，使用默认分类')
      return { category: 'other', label: '其他', confidence: 0 }
    }

    return {
      category: parsed.category || 'other',
      label: parsed.label || '其他',
      confidence: parsed.confidence || 0,
    }
  } catch (err) {
    logger.error({ err }, 'AI 分类失败，使用默认分类')
    return { category: 'other', label: '其他', confidence: 0 }
  }
}

/**
 * 批量分类消息
 * @param {Array} messages - 消息数组（需要有 content 字段）
 * @returns {Array} 附带分类结果的消息数组
 */
async function classifyBatch(messages) {
  const results = []
  for (const msg of messages) {
    const { category, label, confidence } = await classify(msg.content)
    results.push({
      ...msg,
      category,
      categoryLabel: label,
      aiScore: confidence,
    })
    // 简单限流，避免 API 速率限制
    await new Promise(r => setTimeout(r, 500))
  }
  logger.info({ count: results.length }, '批量分类完成')
  return results
}

module.exports = { classify, classifyBatch }
