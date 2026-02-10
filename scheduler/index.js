const cron = require('node-cron')
const config = require('../config')
const logger = require('../utils/logger')
const { classifyBatch } = require('../ai/classifier')
const { generateDailySummary } = require('../ai/summarizer')
const { publishDailySummary } = require('../publisher')

/**
 * 启动所有定时任务
 * @param {object} deps - 依赖注入
 * @param {import('grammy').Bot} deps.bot
 * @param {object} deps.store
 * @param {object} deps.scraper
 */
function startScheduler({ bot, store, scraper }) {
  const { messageRepo, summaryRepo } = store

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

  // 每日总结
  cron.schedule(config.schedule.summaryCron, async () => {
    logger.info('⏰ 每日总结任务开始...')
    try {
      const todayMessages = messageRepo.getToday()

      if (todayMessages.length === 0) {
        logger.info('今日无消息，跳过总结')
        return
      }

      // 生成总结
      const summaryText = await generateDailySummary(todayMessages)

      // 保存到数据库
      const today = new Date().toISOString().split('T')[0]
      const categoryCount = {}
      for (const msg of todayMessages) {
        const cat = msg.category || 'other'
        categoryCount[cat] = (categoryCount[cat] || 0) + 1
      }

      summaryRepo.save({
        date: today,
        content: summaryText,
        categories: categoryCount,
        msgCount: todayMessages.length,
      })

      // 发布到频道
      await publishDailySummary(bot, summaryText)
      logger.info({ date: today, msgCount: todayMessages.length }, '每日总结已生成并发布')
    } catch (err) {
      logger.error({ err }, '每日总结任务出错')
    }
  })

  logger.info({
    scrape: config.schedule.scrapeCron,
    summary: config.schedule.summaryCron,
  }, '定时任务已启动')
}

module.exports = { startScheduler }
