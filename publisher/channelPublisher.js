const fs = require('fs')
const { InputFile } = require('grammy')
const config = require('../config')
const logger = require('../utils/logger')

/** Telegram 单条消息最大长度 */
const MAX_MSG_LENGTH = 4096

/**
 * 向目标频道发送文本消息
 * @param {import('grammy').Bot} bot
 * @param {string} text - 消息内容（支持 Markdown）
 * @param {object} opts
 */
async function sendToChannel(bot, text, opts = {}) {
  const channelId = config.channels.target

  if (!channelId) {
    logger.warn('未配置目标频道，跳过发布')
    return
  }

  // 处理超长消息：分段发送
  const chunks = splitMessage(text, MAX_MSG_LENGTH - 100)

  for (const chunk of chunks) {
    try {
      await bot.api.sendMessage(channelId, chunk, {
        parse_mode: opts.parseMode || 'HTML',
        disable_web_page_preview: opts.disablePreview ?? true,
      })
    } catch (err) {
      // 解析失败时降级为纯文本
      if (err.message && (err.message.includes("can't parse") || err.message.includes('parse'))) {
        logger.warn('消息格式解析失败，降级为纯文本发送')
        await bot.api.sendMessage(channelId, chunk, {
          disable_web_page_preview: opts.disablePreview ?? true,
        })
      } else {
        throw err
      }
    }
  }

  logger.info({ channel: channelId, chunks: chunks.length }, '消息已发送到目标频道')
}

/** 将长文本按最大长度分段 */
function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text]

  const chunks = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    // 尝试在换行符处断开
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt < maxLen * 0.5) {
      splitAt = maxLen
    }
    chunks.push(remaining.substring(0, splitAt))
    remaining = remaining.substring(splitAt).trimStart()
  }

  return chunks
}

/**
 * 向目标频道发送带图片的消息
 * @param {import('grammy').Bot} bot
 * @param {string} imagePath - 图片本地路径
 * @param {string} caption - 图片说明文字
 * @param {object} opts
 */
async function sendPhotoToChannel(bot, imagePath, caption = '', opts = {}) {
  const channelId = config.channels.target

  if (!channelId) {
    logger.warn('未配置目标频道，跳过发布')
    return
  }

  if (!fs.existsSync(imagePath)) {
    logger.warn({ imagePath }, '图片文件不存在，跳过发送')
    return
  }

  try {
    // Telegram 图片说明最大长度 1024
    const truncatedCaption = caption.length > 1000 ? caption.substring(0, 1000) + '...' : caption
    
    await bot.api.sendPhoto(channelId, new InputFile(imagePath), {
      caption: truncatedCaption,
      parse_mode: opts.parseMode || 'HTML',
    })
    logger.info({ channel: channelId }, '图片已发送到目标频道')
  } catch (err) {
    // 解析失败时降级为纯文本说明
    if (err.message && err.message.includes('parse')) {
      logger.warn('图片说明格式解析失败，降级为纯文本')
      const truncatedCaption = caption.length > 1000 ? caption.substring(0, 1000) + '...' : caption
      await bot.api.sendPhoto(channelId, new InputFile(imagePath), {
        caption: truncatedCaption,
      })
    } else {
      throw err
    }
  }
}

module.exports = { sendToChannel, sendPhotoToChannel }
