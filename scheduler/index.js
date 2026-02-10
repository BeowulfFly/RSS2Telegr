const cron = require('node-cron')
const config = require('../config')
const logger = require('../utils/logger')
const { classifyBatch } = require('../ai/classifier')
const { publishMessages } = require('../publisher')

/**
 * 启动所有定时任务
 * @param {object} deps - 依赖注入
 * @param {import('grammy').Bot} deps.bot
 * @param {object} deps.store
 * @param {object} deps.scraper
 */
function startScheduler({ bot, store, scraper }) {
  const { messageRepo } = store

  // 定时抓取历史消息（补充实时监听可能遗漏的）
  cron.schedule(config.schedule.scrapeCron, async () => {
    logger.info('⏰ 定时抓取任务开始...')
    try {
      const { filterPipeline } = require('../filter')
      const messages = await scraper.fetchAllHistory(30)

      if (messages.length === 0) {
        logger.info('本次抓取无新消息')
        return
      }

      // 过滤
      const filtered = filterPipeline(messages, messageRepo)

      if (filtered.length === 0) {
        logger.info('过滤后无新消息')
        return
      }

      // AI 分类
      const classified = await classifyBatch(filtered)

      // 存储
      messageRepo.saveMany(classified)
      logger.info({ count: classified.length }, '定时抓取完成，已保存新消息')
    } catch (err) {
      logger.error({ err }, '定时抓取任务出错')
    }
  })

  // 每日发布（逐条发送，不聚合、不小结）
  cron.schedule(config.schedule.summaryCron, async () => {
    logger.info('⏰ 每日发布任务开始...')
    try {
      const todayMessages = messageRepo.getToday()

      if (todayMessages.length === 0) {
        logger.info('今日无消息，跳过发布')
        return
      }

      // 过滤掉垃圾分类
      const validMessages = todayMessages.filter(m => m.category !== 'spam')

      if (validMessages.length === 0) {
        logger.info('今日无有效消息（均为垃圾），跳过发布')
        return
      }

      // 逐条发送，间隔 500ms
      await publishMessages(bot, validMessages, 500)

      logger.info({ date: new Date().toISOString().split('T')[0], msgCount: validMessages.length }, '每日消息已逐条发布')
    } catch (err) {
      logger.error({ err }, '每日发布任务出错')
    }
  })

  logger.info({
    scrape: config.schedule.scrapeCron,
    summary: config.schedule.summaryCron,
  }, '定时任务已启动')
}

module.exports = { startScheduler }
