const logger = require('./logger')

/**
 * 带指数退避的重试包装器
 * @param {Function} fn - 要执行的异步函数
 * @param {object} opts - 配置
 * @param {number} opts.retries - 最大重试次数（默认 3）
 * @param {number} opts.baseDelay - 基础延迟毫秒（默认 1000）
 * @param {string} opts.label - 日志标签
 * @returns {Promise<*>}
 */
async function retry(fn, { retries = 3, baseDelay = 1000, label = 'operation' } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries) {
        logger.error({ err, label }, `${label} 失败，已耗尽所有重试次数`)
        throw err
      }
      const delay = baseDelay * Math.pow(2, attempt - 1)
      logger.warn({ attempt, delay, label }, `${label} 第 ${attempt} 次失败，${delay}ms 后重试...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

module.exports = { retry }
