require('dotenv').config()

/** 解析逗号分隔的环境变量为数组 */
function parseList(envStr, fallback = []) {
  if (!envStr) return fallback
  return envStr.split(',').map(s => s.trim()).filter(Boolean)
}

module.exports = {
  // Telegram Bot
  bot: {
    token: process.env.BOT_TOKEN || '',
  },

  // Telegram Client (MTProto)
  telegram: {
    apiId: parseInt(process.env.TG_API_ID, 10) || 0,
    apiHash: process.env.TG_API_HASH || '',
  },

  // 频道配置
  channels: {
    sources: parseList(process.env.SOURCE_CHANNELS),
    target: process.env.TARGET_CHANNEL || '',
  },

  // AI 模型配置（支持 OpenAI / DeepSeek 等兼容 OpenAI API 的服务）
  ai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseURL: process.env.OPENAI_BASE_URL || undefined, // 配置为 DeepSeek 等其他 API 地址
    enableChat: process.env.ENABLE_AI_CHAT === 'true', // 启用 AI 聊天功能
  },

  // 过滤规则
  filter: {
    keywords: parseList(process.env.FILTER_KEYWORDS),
    excludeKeywords: parseList(process.env.EXCLUDE_KEYWORDS),
    minLength: parseInt(process.env.MIN_MESSAGE_LENGTH, 10) || 20,
  },

  // 定时任务
  schedule: {
    scrapeCron: process.env.SCRAPE_CRON || '*/10 * * * *',
    summaryCron: process.env.SUMMARY_CRON || '0 22 * * *',
  },

  // 发布配置
  publisher: {
    intervalMs: parseInt(process.env.PUBLISH_INTERVAL_MS, 10) || 3000, // 消息发布间隔（毫秒）
  },

  // 日志
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
}
