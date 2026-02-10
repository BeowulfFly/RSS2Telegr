// 强制 Node.js 优先使用 IPv4（解决 IPv6 连接超时问题）
const dns = require('dns')
dns.setDefaultResultOrder('ipv4first')

const logger = require('./utils/logger')
const config = require('./config')
const { createStore } = require('./store')
const { createBot } = require('./bot')
const { setScraper } = require('./bot/commands')
const { createScraper } = require('./scraper')
const { filterPipeline } = require('./filter')
const { classifyBatch } = require('./ai/classifier')
const { startScheduler } = require('./scheduler')

async function main() {
  logger.info('🚀 RSS2Telegr 启动中...')

  // 1. 初始化存储层
  const store = createStore()
  logger.info('✅ 存储层就绪')

  // 2. 初始化 Bot
  const bot = createBot(store)
  logger.info('✅ Bot 就绪')

  // 3. 初始化 Scraper（MTProto 客户端）
  //    onMessage 回调：实时消息进入过滤 → 分类 → 存储管线
  const scraper = await createScraper(async (msg) => {
    // 过滤（单条消息也走管线，传入 aiDedupRepo 支持 AI 去重）
    const filtered = await filterPipeline([msg], store.messageRepo, store.aiDedupRepo)
    if (filtered.length === 0) return

    // AI 分类
    const classified = await classifyBatch(filtered)

    // 存储
    store.messageRepo.saveMany(classified)
    logger.info({ source: msg.source, category: classified[0]?.category }, '新消息已处理并保存')
  })
  logger.info('✅ Scraper 就绪')

  // 注入 scraper 引用给 commands（供 /fetch 命令使用）
  setScraper(scraper)

  // 4. 启动定时任务
  startScheduler({ bot, store, scraper })
  logger.info('✅ 定时任务就绪')

  // 5. 启动 Bot（long polling）
  bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => logger.info({ username: botInfo.username }, '✅ Bot 已启动，开始接收消息'),
  }).catch((err) => {
    logger.error({ err }, 'Bot 启动失败')
  })

  // 优雅退出
  const shutdown = async () => {
    logger.info('正在关闭...')
    bot.stop()
    await scraper.disconnect()
    store.db.close()
    logger.info('已安全退出')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  logger.error({ err }, '启动失败')
  process.exit(1)
})
