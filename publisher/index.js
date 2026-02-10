const { sendToChannel, sendPhotoToChannel } = require('./channelPublisher')
const logger = require('../utils/logger')

/**
 * 发布每日总结到频道
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

  // HTML 格式：标题小字灰色，内容加粗突出，增加行距
  const text = `📌 <b>${category}</b>\n\n` +
    `<i>来源: ${source}</i>\n\n` +
    `━━━━━━━━━━━━━━━\n\n\n` +
    `<b>${content}</b>`

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

module.exports = { publishDailySummary, publishSingleMessage }
