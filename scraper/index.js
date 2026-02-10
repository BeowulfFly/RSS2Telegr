const { createClient, startListening, fetchHistory } = require('./channelListener')
const config = require('../config')
const logger = require('../utils/logger')

/**
 * 初始化抓取器
 * @param {Function} onMessage - 新消息回调
 * @returns {object} scraper 实例（含 client 引用和控制方法）
 */
async function createScraper(onMessage) {
  const client = await createClient()

  // 实时监听
  startListening(client, onMessage)

  return {
    client,

    /** 手动拉取所有源频道的历史消息 */
    async fetchAllHistory(limit = 50) {
      const allMessages = []
      for (const channel of config.channels.sources) {
        const msgs = await fetchHistory(client, channel, limit)
        allMessages.push(...msgs)
      }
      logger.info({ total: allMessages.length }, '所有频道历史拉取完成')
      return allMessages
    },

    /** 断开连接 */
    async disconnect() {
      await client.disconnect()
      logger.info('Telegram Client 已断开')
    },
  }
}

module.exports = { createScraper }
