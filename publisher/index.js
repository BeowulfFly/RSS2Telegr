const { sendToChannel, sendPhotoToChannel } = require('./channelPublisher')
const logger = require('../utils/logger')

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 发布每日总结到频道（保留兼容）
 * @param {import('grammy').Bot} bot
 * @param {string} summaryText
 */
async function publishDailySummary(bot, summaryText) {
  try {
    await sendToChannel(bot, summaryText)
    logger.info('每日总结已发布到频道')
  } catch (err) {
    logger.error({ err }, '发布每日总结失败')
  }
}

/**
 * 逐条发布消息到频道（不聚合、不小结，保持原样）
 * @param {import('grammy').Bot} bot
 * @param {Array} messages - 消息数组
 * @param {number} intervalMs - 每条消息发送间隔（毫秒），默认 500
 */
async function publishMessages(bot, messages, intervalMs = 500) {
  if (!messages || messages.length === 0) {
    logger.info('无消息需要发布')
    return
  }

  let successCount = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    try {
      await publishSingleMessage(bot, msg)
      successCount++
    } catch (err) {
      logger.error({ err, source: msg.source }, '发布单条消息失败')
    }

    // 非最后一条时等待间隔
    if (i < messages.length - 1) {
      await sleep(intervalMs)
    }
  }

  logger.info({ total: messages.length, success: successCount }, '批量消息发布完成')
}

/**
 * 发布单条精选消息到频道（使用 HTML 格式让内容更突出，支持图片）
 * @param {import('grammy').Bot} bot
 * @param {object} msg - 消息对象
 */
async function publishSingleMessage(bot, msg) {
  // 转义 HTML 特殊字符
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const category = msg.categoryLabel || msg.category || '精选'
  const source = escapeHtml(msg.source || '未知')
  const content = escapeHtml(msg.content || '')

  // HTML 格式：内容在上，来源在下
  const text = `<b>${content}</b>\n\n` +
    `<i>来源: ${source}</i>`

  try {
    // 如果有图片，发送带图片的消息
    if (msg.mediaPath) {
      await sendPhotoToChannel(bot, msg.mediaPath, text)
    } else {
      await sendToChannel(bot, text)
    }
    logger.debug({ source: msg.source, hasMedia: !!msg.mediaPath }, '精选消息已发布')
  } catch (err) {
    logger.error({ err }, '发布精选消息失败')
  }
}

module.exports = { publishDailySummary, publishSingleMessage, publishMessages }
