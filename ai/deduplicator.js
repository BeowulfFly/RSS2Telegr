const { chat } = require('./index')
const { eventDedupPrompt, prePublishDedupPrompt } = require('./prompt')
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

/**
 * 发布前 AI 去重：对比当前待发布消息与历史已发消息，去除重复
 * @param {Array} currentMessages - 当前待发布消息数组
 * @param {Array} historicalMessages - 历史已发消息数组（仅供对比）
 * @param {import('../store/aiDedupRepo')} aiDedupRepo - 去重记录存储（可选）
 * @returns {Promise<Array>} 去重后的待发布消息数组
 */
async function aiDedupBeforePublish(currentMessages, historicalMessages = [], aiDedupRepo = null) {
  if (!currentMessages || currentMessages.length === 0) {
    return currentMessages
  }

  // 当前消息只有一条，且无历史消息时，无需 AI 判断
  if (currentMessages.length === 1 && historicalMessages.length === 0) {
    return currentMessages
  }

  // 构建简化的当前消息列表（供 AI 分析，截断过长内容）
  const simplifiedCurrent = currentMessages.map((m, i) => ({
    index: i,
    source: m.source || '未知',
    content: (m.content || '').substring(0, 400),
  }))

  // 构建简化的历史消息列表（最多取 60 条，缩短内容节省 token）
  const simplifiedHistorical = historicalMessages.slice(0, 60).map((m, i) => ({
    index: i,
    source: m.source || '未知',
    content: (m.content || '').substring(0, 200),
  }))

  try {
    const resultText = await retry(
      () => chat(prePublishDedupPrompt(
        JSON.stringify(simplifiedCurrent, null, 2),
        JSON.stringify(simplifiedHistorical, null, 2)
      ), {
        temperature: 0.1,
        maxTokens: 1000,
      }),
      { retries: 2, label: 'AI发布前去重' }
    )

    const parsed = extractJSON(resultText)

    if (!parsed || !Array.isArray(parsed.skip) || parsed.skip.length === 0) {
      logger.debug('AI 发布前去重：未发现重复，全部保留')
      return currentMessages
    }

    const skipIndices = new Set(parsed.skip.map(Number))

    // 保存去重记录
    const details = Array.isArray(parsed.details) ? parsed.details : []
    const dedupRecords = details
      .filter(d => typeof d.skip_index === 'number' && currentMessages[d.skip_index])
      .map(d => ({
        keptMsg: { content: d.reason || '历史消息', source: '历史' },
        removedMsg: currentMessages[d.skip_index],
        reason: d.reason || '',
      }))

    if (dedupRecords.length > 0 && aiDedupRepo) {
      aiDedupRepo.saveMany(dedupRecords)
    }

    logger.info({ skipped: skipIndices.size }, `AI 发布前去重：跳过 ${skipIndices.size} 条重复消息`)

    return currentMessages.filter((_, i) => !skipIndices.has(i))

  } catch (err) {
    logger.error({ err }, 'AI 发布前去重失败，跳过此步骤')
    return currentMessages
  }
}

module.exports = { aiDedup, aiDedupBeforePublish }
