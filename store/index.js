const { initDB } = require('./db')
const MessageRepo = require('./messageRepo')
const SummaryRepo = require('./summaryRepo')

/** 初始化存储层，返回各 Repo 实例 */
function createStore() {
  const db = initDB()
  return {
    db,
    messageRepo: new MessageRepo(db),
    summaryRepo: new SummaryRepo(db),
  }
}

module.exports = { createStore }
