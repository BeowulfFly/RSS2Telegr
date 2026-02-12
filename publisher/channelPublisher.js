const fs = require('fs')
const { InputFile } = require('grammy')
const config = require('../config')
const logger = require('../utils/logger')

/** Telegram 单条消息最大长度 */
const MAX_MSG_LENGTH = 4096

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 向目标频道发送文本消息（带 429 错误自动重试）
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
    await sendMessageWithRetry(bot, channelId, chunk, {
      parse_mode: opts.parseMode || 'HTML',
      disable_web_page_preview: opts.disablePreview ?? true,
    })
  }

  logger.info({ channel: channelId, chunks: chunks.length }, '消息已发送到目标频道')
}

/**
 * 发送消息并自动处理 429 错误重试
 * @param {import('grammy').Bot} bot
 * @param {string} channelId
 * @param {string} text
 * @param {object} options
 */
async function sendMessageWithRetry(bot, channelId, text, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.api.sendMessage(channelId, text, options)
      return // 成功发送，退出
    } catch (err) {
      // 处理 429 错误（频率限制）
      if (err.error_code === 429) {
        const retryAfter = (err.parameters?.retry_after || 30) * 1000 // 转换为毫秒
        logger.warn({ attempt, retryAfter }, `触发 Telegram 频率限制，等待 ${retryAfter}ms 后重试...`)
        await sleep(retryAfter + 1000) // 额外加 1 秒保险
        continue
      }

      // 处理解析错误，降级为纯文本
      if (err.message && (err.message.includes("can't parse") || err.message.includes('parse'))) {
        logger.warn('消息格式解析失败，降级为纯文本发送')
        const fallbackOptions = { ...options }
        delete fallbackOptions.parse_mode
        await bot.api.sendMessage(channelId, text, fallbackOptions)
        return
      }

      // 其他错误直接抛出
      throw err
    }
  }
  throw new Error(`发送消息失败，已重试 ${maxRetries} 次`)
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
 * 向目标频道发送带图片的消息（带 429 错误自动重试）
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

  // Telegram 图片说明最大长度 1024
  const truncatedCaption = caption.length > 1000 ? caption.substring(0, 1000) + '...' : caption
  
  await sendPhotoWithRetry(bot, channelId, imagePath, truncatedCaption, {
    parse_mode: opts.parseMode || 'HTML',
  })

  logger.info({ channel: channelId }, '图片已发送到目标频道')
}

/**
 * 发送图片并自动处理 429 错误重试
 * @param {import('grammy').Bot} bot
 * @param {string} channelId
 * @param {string} imagePath
 * @param {string} caption
 * @param {object} options
 */
async function sendPhotoWithRetry(bot, channelId, imagePath, caption, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.api.sendPhoto(channelId, new InputFile(imagePath), {
        caption,
        ...options,
      })
      return // 成功发送，退出
    } catch (err) {
      // 处理 429 错误（频率限制）
      if (err.error_code === 429) {
        const retryAfter = (err.parameters?.retry_after || 30) * 1000 // 转换为毫秒
        logger.warn({ attempt, retryAfter }, `触发 Telegram 频率限制，等待 ${retryAfter}ms 后重试...`)
        await sleep(retryAfter + 1000) // 额外加 1 秒保险
        continue
      }

      // 处理解析错误，降级为纯文本
      if (err.message && err.message.includes('parse')) {
        logger.warn('图片说明格式解析失败，降级为纯文本')
        const fallbackOptions = { ...options }
        delete fallbackOptions.parse_mode
        await bot.api.sendPhoto(channelId, new InputFile(imagePath), {
          caption,
          ...fallbackOptions,
        })
        return
      }

      // 其他错误直接抛出
      throw err
    }
  }
  throw new Error(`发送图片失败，已重试 ${maxRetries} 次`)
}

module.exports = { sendToChannel, sendPhotoToChannel }
