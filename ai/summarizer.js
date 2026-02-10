const { chat } = require('./index')
const { categorySummaryPrompt, extractSpamKeywordsPrompt } = require('./prompt')
const { retry } = require('../utils/retry')
const logger = require('../utils/logger')
const { addSpamKeywords } = require('../store/spamKeywords')

/** 转义 HTML 特殊字符 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 移除消息末尾的链接（避免与来源链接重复） */
function removeTrailingUrl(text) {
  // 匹配末尾的 URL（可能前面有空白或换行）
  return text.replace(/\s*(https?:\/\/[^\s]+)\s*$/i, '').trim()
}

/** 分类 emoji 映射 */
const categoryEmoji = {
  tech: '🔧',
  finance: '💰',
  crypto: '🪙',
  news: '📰',
  tutorial: '📚',
  tools: '🛠️',
  opinion: '💬',
  other: '📌',
  spam: '🗑️',
}

/**
 * 生成每日总结（消息原样展示，AI 只生成每个分类的小结）
 * @param {Array} messages - 当日消息数组（需要有 content, category, source 字段）
 * @returns {string} 总结文本（HTML 格式）
 */
async function generateDailySummary(messages) {
  if (messages.length === 0) {
    return '📭 今日无新消息。'
  }

  // 按分类分组
  const grouped = {}
  for (const msg of messages) {
    const cat = msg.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(msg)
  }

  // 获取当前日期
  const today = new Date().toISOString().split('T')[0]

  // 构建输出
  let output = `📊 <b>${today} 信息总结</b>\n\n`

  for (const [category, msgs] of Object.entries(grouped)) {
    // 跳过垃圾信息分类（不显示），但提取关键词用于未来过滤
    if (category === 'spam') {
      logger.info({ count: msgs.length }, `跳过 ${msgs.length} 条垃圾信息`)
      // 从垃圾信息中提取关键词
      try {
        const spamTexts = msgs.map(m => m.content).join('\n---\n')
        const keywordsText = await retry(
          () => chat(extractSpamKeywordsPrompt(spamTexts), { temperature: 0.3, maxTokens: 100 }),
          { retries: 1, label: '提取垃圾关键词' }
        )
        const keywords = keywordsText.split(',').map(k => k.trim()).filter(Boolean)
        if (keywords.length > 0) {
          addSpamKeywords(keywords)
          logger.info({ keywords }, '从垃圾信息中学习到新关键词')
        }
      } catch (err) {
        logger.warn({ err }, '提取垃圾关键词失败')
      }
      continue
    }

    const emoji = categoryEmoji[category] || '📌'
    const label = msgs[0]?.categoryLabel || category

    // 分类标题
    output += `\n<b>${emoji} ${label}</b>\n\n`

    // 原样展示每条消息（用横线隔开，增加间距）
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      const source = escapeHtml(msg.source || '未知')
      // 移除末尾链接，避免与来源重复
      const content = escapeHtml(removeTrailingUrl(msg.content.trim()))
      output += `${content}\n\n`
      output += `<i>— ${source}</i>\n\n`
      // 消息之间用横线隔开（最后一条不加）
      if (i < msgs.length - 1) {
        output += `───────────────\n\n`
      }
    }

    // AI 生成该分类的小结
    try {
      const messagesForAI = msgs.map(m => m.content).join('\n---\n')
      const summaryText = await retry(
        () => chat(categorySummaryPrompt(label, messagesForAI), { temperature: 0.5, maxTokens: 200 }),
        { retries: 1, label: `${label}小结` }
      )
      output += `\n🟢 <b>小结：${escapeHtml(summaryText)}</b>\n\n\n`
    } catch (err) {
      logger.warn({ err, category }, '分类小结生成失败')
      output += `\n🟢 <b>小结：共 ${msgs.length} 条相关消息</b>\n\n\n`
    }
  }

  logger.info({ msgCount: messages.length, categories: Object.keys(grouped).length }, '每日总结生成完成')
  return output
}

module.exports = { generateDailySummary }
