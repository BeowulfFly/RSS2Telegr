const { chat } = require('./index')
const { eventDedupPrompt } = require('./prompt')
const { retry } = require('../utils/retry')
const logger = require('../utils/logger')

/**
 * 从 AI 返回中提取 JSON
 */
function extractJSON(text) {
  try {
    return JSON.parse(text.trim())
  } catch {
    // 尝试提取 {...}
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * 使用 AI 对消息进行事件级去重
 * @param {Array} messages - 消息数组
 * @param {import('../store/aiDedupRepo')} aiDedupRepo - 去重记录存储
 * @returns {Promise<Array>} 去重后的消息数组
 */
async function aiDedup(messages, aiDedupRepo) {
  if (messages.length < 2) {
    return messages
  }

  // 构建简化的消息列表供 AI 分析
  const simplified = messages.map((m, i) => ({
    index: i,
    source: m.source || '未知',
    content: m.content.substring(0, 500), // 截取前500字避免太长
  }))

  try {
    const resultText = await retry(
      () => chat(eventDedupPrompt(JSON.stringify(simplified, null, 2)), {
        temperature: 0.1,
        maxTokens: 1000,
      }),
      { retries: 2, label: 'AI事件去重' }
    )

    const parsed = extractJSON(resultText)

    if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
      logger.debug('AI 未发现重复事件')
      return messages
    }

    // 收集要移除的索引和去重记录
    const removeIndices = new Set()
    const dedupRecords = []

    for (const group of parsed.groups) {
      const keepIdx = group.keep
      const removeIdxList = group.remove || []
      const reason = group.reason || ''

      if (typeof keepIdx !== 'number' || !Array.isArray(removeIdxList)) {
        continue
      }

      const keptMsg = messages[keepIdx]
      if (!keptMsg) continue

      for (const rmIdx of removeIdxList) {
        if (typeof rmIdx === 'number' && rmIdx !== keepIdx && messages[rmIdx]) {
          removeIndices.add(rmIdx)
          dedupRecords.push({
            keptMsg,
            removedMsg: messages[rmIdx],
            reason,
          })
        }
      }
    }

    // 保存去重记录
    if (dedupRecords.length > 0 && aiDedupRepo) {
      aiDedupRepo.saveMany(dedupRecords)
      logger.info({ removed: dedupRecords.length }, 'AI 事件去重完成，已保存记录')
    }

    // 返回过滤后的消息
    const filtered = messages.filter((_, i) => !removeIndices.has(i))
    return filtered

  } catch (err) {
    logger.error({ err }, 'AI 事件去重失败，跳过此步骤')
    return messages
  }
}

module.exports = { aiDedup }
