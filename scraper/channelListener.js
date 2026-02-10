const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { NewMessage } = require('telegram/events')
const input = require('input')
const fs = require('fs')
const path = require('path')
const config = require('../config')
const logger = require('../utils/logger')

const SESSION_FILE = path.join(__dirname, '..', 'session.json')
const MEDIA_DIR = path.join(__dirname, '..', 'media')

// 确保媒体目录存在
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
}

/** 加载已保存的 session */
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'))
      return new StringSession(data.session || '')
    }
  } catch {
    // ignore
  }
  return new StringSession('')
}

/** 保存 session 到文件 */
function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ session: session.save() }))
  logger.info('Telegram Client session 已保存')
}

/**
 * 创建 Telegram MTProto 客户端（用于监听其他频道）
 * 首次运行需要手机号登录，之后会复用 session
 */
async function createClient() {
  const session = loadSession()

  const client = new TelegramClient(
    session,
    config.telegram.apiId,
    config.telegram.apiHash,
    {
      connectionRetries: 5,
    }
  )

  await client.start({
    phoneNumber: async () => await input.text('请输入你的 Telegram 手机号: '),
    password: async () => await input.text('请输入两步验证密码 (如无则回车): '),
    phoneCode: async () => await input.text('请输入收到的验证码: '),
    onError: (err) => logger.error({ err }, 'Telegram Client 登录出错'),
  })

  // 保存 session 供下次复用
  saveSession(client.session)
  logger.info('Telegram Client 已连接')

  return client
}

/**
 * 开始实时监听源频道的新消息
 * @param {TelegramClient} client
 * @param {Function} onMessage - 回调函数，接收标准化的消息对象
 */
function startListening(client, onMessage) {
  const sources = config.channels.sources

  if (sources.length === 0) {
    logger.warn('未配置源频道，跳过监听')
    return
  }

  client.addEventHandler(async (event) => {
    const message = event.message
    // 支持纯文本或带图片的消息
    if (!message || (!message.text && !message.media)) return

    // 获取来源频道信息
    let sourceName = ''
    try {
      const chat = await message.getChat()
      sourceName = chat.title || chat.username || String(chat.id)
    } catch {
      sourceName = 'unknown'
    }

    logger.debug({ source: sourceName }, '收到新消息')

    // 下载图片（如果有）
    let mediaPath = null
    if (message.photo || (message.media && message.media.photo)) {
      try {
        const fileName = `${Date.now()}_${message.id}.jpg`
        const filePath = path.join(MEDIA_DIR, fileName)
        await client.downloadMedia(message, { outputFile: filePath })
        mediaPath = filePath
        logger.debug({ source: sourceName, file: fileName }, '图片已下载')
      } catch (err) {
        logger.warn({ err, source: sourceName }, '下载图片失败')
      }
    }

    // 标准化消息格式
    const normalized = {
      source: sourceName,
      messageId: message.id,
      content: message.text || message.message || '',
      url: '',
      date: message.date ? new Date(message.date * 1000) : new Date(),
      mediaPath, // 图片本地路径
    }

    try {
      await onMessage(normalized)
    } catch (err) {
      logger.error({ err, source: sourceName }, '处理消息时出错')
    }
  }, new NewMessage({ chats: sources }))

  logger.info({ sources }, `已开始监听 ${sources.length} 个源频道`)
}

/**
 * 主动拉取频道历史消息（首次运行或补充抓取时使用）
 * @param {TelegramClient} client
 * @param {string} channel - 频道用户名或 ID
 * @param {number} limit - 拉取条数
 * @returns {Array} 标准化消息数组
 */
async function fetchHistory(client, channel, limit = 50) {
  const messages = []

  try {
    const result = await client.getMessages(channel, { limit })

    for (const msg of result) {
      // 支持纯文本或带图片的消息
      if (!msg.text && !msg.media) continue

      // 下载图片（如果有）
      let mediaPath = null
      if (msg.photo || (msg.media && msg.media.photo)) {
        try {
          const fileName = `${Date.now()}_${msg.id}.jpg`
          const filePath = path.join(MEDIA_DIR, fileName)
          await client.downloadMedia(msg, { outputFile: filePath })
          mediaPath = filePath
          logger.debug({ channel, file: fileName }, '图片已下载')
        } catch (err) {
          logger.warn({ err, channel }, '下载图片失败')
        }
      }

      messages.push({
        source: channel,
        messageId: msg.id,
        content: msg.text || msg.message || '',
        url: '',
        date: msg.date ? new Date(msg.date * 1000) : new Date(),
        mediaPath, // 图片本地路径
      })
    }

    logger.info({ channel, count: messages.length }, '历史消息拉取完成')
  } catch (err) {
    logger.error({ err, channel }, '拉取历史消息失败')
  }

  return messages
}

module.exports = { createClient, startListening, fetchHistory }
