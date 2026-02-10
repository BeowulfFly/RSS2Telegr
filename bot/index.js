const { Bot } = require('grammy')
const config = require('../config')
const logger = require('../utils/logger')
const { registerCommands } = require('./commands')

/** 创建并初始化 Telegram Bot 实例 */
function createBot(store) {
  const bot = new Bot(config.bot.token)

  // 注册命令处理
  registerCommands(bot, store)

  // 全局错误处理
  bot.catch((err) => {
    logger.error({ err: err.error }, 'Bot 运行出错')
  })

  return bot
}

module.exports = { createBot }
