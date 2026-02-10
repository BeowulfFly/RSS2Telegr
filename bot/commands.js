const logger = require('../utils/logger')
const { filterPipeline } = require('../filter')
const { classifyBatch } = require('../ai/classifier')
const { publishMessages } = require('../publisher')

// 用于存储 scraper 引用（由 index.js 注入）
let _scraper = null

/** 设置 scraper 引用（供 /fetch 命令使用） */
function setScraper(scraper) {
  _scraper = scraper
}

/** 注册 Bot 命令 */
function registerCommands(bot, store) {
  const { messageRepo, summaryRepo, aiDedupRepo } = store

  // /start - 欢迎信息
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '👋 欢迎使用频道聚合 Bot！\n\n' +
      '可用命令：\n' +
      '/status - 查看当前运行状态\n' +
      '/today - 查看今日消息统计\n' +
      '/summary - 获取最近一次每日总结\n' +
      '/recent - 查看最近消息（默认10条）\n' +
      '  └ /recent 5 - 查看最近5条\n' +
      '  └ /recent 3-8 - 查看第3到第8条\n' +
      '/search - 关键词搜索消息\n' +
      '  └ /search AI 科技 - 匹配任意词（或）\n' +
      '  └ /search and AI 科技 - 匹配全部词（且）\n' +
      '/dedup - 查看 AI 去重记录对比\n' +
      '  └ /dedup 10 - 查看最近10条去重记录\n' +
      '/fetch - 立即抓取、处理并发布\n' +
      '/clear - 清除历史数据\n' +
      '  └ /clear all - 清除所有\n' +
      '  └ /clear 2026-02-10 - 清除指定日期\n' +
      '  └ /clear before 2026-02-01 - 清除该日期之前'
    )
  })

  // /status - 运行状态
  bot.command('status', async (ctx) => {
    const todayCount = messageRepo.countToday()
    const recentSummaries = summaryRepo.getRecent(1)
    const lastSummary = recentSummaries[0]

    let text = `📊 *运行状态*\n\n`
    text += `今日已采集消息：${todayCount} 条\n`
    text += `最近总结日期：${lastSummary ? lastSummary.date : '暂无'}`

    await ctx.reply(text, { parse_mode: 'Markdown' })
  })

  // /today - 今日消息统计
  bot.command('today', async (ctx) => {
    const messages = messageRepo.getToday()
    if (messages.length === 0) {
      await ctx.reply('📭 今日暂无采集到的消息')
      return
    }

    // 按分类分组统计
    const categoryMap = {}
    for (const msg of messages) {
      const cat = msg.category || '未分类'
      categoryMap[cat] = (categoryMap[cat] || 0) + 1
    }

    let text = `📋 *今日消息统计* (共 ${messages.length} 条)\n\n`
    for (const [cat, count] of Object.entries(categoryMap)) {
      text += `• ${cat}: ${count} 条\n`
    }

    await ctx.reply(text, { parse_mode: 'Markdown' })
  })

  // /summary - 最近一次总结
  bot.command('summary', async (ctx) => {
    const recent = summaryRepo.getRecent(1)
    if (recent.length === 0) {
      await ctx.reply('📭 暂无每日总结，等待定时任务生成...')
      return
    }

    const s = recent[0]
    const text = `📝 *${s.date} 每日总结*\n(共 ${s.msg_count} 条消息)\n\n${s.content}`

    // Telegram 消息有 4096 字符限制
    if (text.length > 4000) {
      await ctx.reply(text.substring(0, 4000) + '\n\n...（内容过长已截断）', { parse_mode: 'Markdown' })
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown' })
    }
  })

  // /recent - 最近消息（全部显示，默认10条，可加参数）
  // 用法: /recent 或 /recent 5 或 /recent 3-8
  bot.command('recent', async (ctx) => {
    const text = ctx.message.text.trim()
    const parts = text.split(/\s+/)
    // parts[0] = '/recent', parts[1] = 参数（可选）

    let limit = 10
    let offset = 0

    if (parts[1]) {
      const param = parts[1]
      // 支持 /recent 5（显示最近5条）或 /recent 3-8（显示第3到第8条）
      if (param.includes('-')) {
        const [start, end] = param.split('-').map(n => parseInt(n, 10))
        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
          offset = start - 1
          limit = end - start + 1
        }
      } else {
        const num = parseInt(param, 10)
        if (!isNaN(num) && num > 0) {
          limit = num
        }
      }
    }

    // 获取消息（先获取 offset + limit 条，再跳过 offset）
    const allMessages = messageRepo.getRecent(offset + limit)
    const messages = allMessages.slice(offset, offset + limit)

    if (messages.length === 0) {
      await ctx.reply('📭 暂无消息')
      return
    }

    // 转义 HTML 特殊字符
    const escapeHtml = (str) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    for (const msg of messages) {
      const content = msg.content.trim()
      const source = escapeHtml(msg.source || '未知')

      // 简洁格式：只显示内容和来源
      let msgText = `<b>${escapeHtml(content)}</b>\n\n`
      msgText += `<i>— ${source}</i>`

      // 如果单条消息太长，分段发送
      if (msgText.length > 4000) {
        const chunks = []
        let remaining = msgText
        while (remaining.length > 0) {
          chunks.push(remaining.substring(0, 4000))
          remaining = remaining.substring(4000)
        }
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'HTML' })
        }
      } else {
        await ctx.reply(msgText, { parse_mode: 'HTML' })
      }
    }
  })

  // /search - 关键词搜索消息
  // 用法: /search 关键词1 关键词2 （默认或）
  //       /search and 关键词1 关键词2 （且）
  bot.command('search', async (ctx) => {
    const text = ctx.message.text.trim()
    const parts = text.split(/\s+/).slice(1) // 去掉 /search

    if (parts.length === 0) {
      await ctx.reply(
        '🔍 搜索命令用法：\n\n' +
        '/search 关键词1 关键词2 - 匹配任意词（或）\n' +
        '/search and 关键词1 关键词2 - 匹配全部词（且）\n\n' +
        '示例：\n' +
        '• /search AI 科技 - 包含 AI 或 科技\n' +
        '• /search and AI 科技 - 同时包含 AI 和 科技'
      )
      return
    }

    // 判断模式：第一个词是 'and' 或 'or' 则作为模式标识
    let mode = 'or'
    let keywords = parts

    if (parts[0].toLowerCase() === 'and') {
      mode = 'and'
      keywords = parts.slice(1)
    } else if (parts[0].toLowerCase() === 'or') {
      mode = 'or'
      keywords = parts.slice(1)
    }

    if (keywords.length === 0) {
      await ctx.reply('❌ 请提供至少一个搜索关键词')
      return
    }

    const modeText = mode === 'and' ? '且' : '或'
    await ctx.reply(`🔍 搜索中... 关键词: ${keywords.join(', ')} (${modeText})`)

    const messages = messageRepo.search(keywords, mode, 20)

    if (messages.length === 0) {
      await ctx.reply('📭 未找到匹配的消息')
      return
    }

    await ctx.reply(`📋 找到 ${messages.length} 条匹配消息：`)

    // 转义 HTML 特殊字符
    const escapeHtml = (str) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // 高亮关键词（用 <u> 下划线标记）
    const highlightKeywords = (content, kws) => {
      let result = escapeHtml(content)
      for (const kw of kws) {
        const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        result = result.replace(regex, '<u><b>$1</b></u>')
      }
      return result
    }

    for (const msg of messages) {
      const cat = msg.category ? `[${msg.category}]` : ''
      const content = msg.content.trim()

      let msgText = `${cat} <b>#${msg.id}</b>\n\n`
      msgText += `<i>📅 ${msg.created_at} | 来源: ${escapeHtml(msg.source)}</i>\n\n`
      msgText += `━━━━━━━━━━━━━━━\n\n\n`
      msgText += highlightKeywords(content, keywords)

      // 如果单条消息太长，分段发送
      if (msgText.length > 4000) {
        const chunks = []
        let remaining = msgText
        while (remaining.length > 0) {
          chunks.push(remaining.substring(0, 4000))
          remaining = remaining.substring(4000)
        }
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'HTML' })
        }
      } else {
        await ctx.reply(msgText, { parse_mode: 'HTML' })
      }
    }
  })

  // 处理展开全文的回调
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    if (!data.startsWith('expand_')) return

    // 转义 HTML 特殊字符
    const escapeHtml = (str) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    const msgId = parseInt(data.replace('expand_', ''), 10)
    const msg = messageRepo.getById(msgId)

    if (!msg) {
      await ctx.answerCallbackQuery({ text: '消息不存在或已被删除' })
      return
    }

    const cat = msg.category ? `[${msg.category}]` : ''
    let fullText = `${cat} <b>#${msg.id}</b> (全文)\n\n`
    fullText += `<i>📅 ${msg.created_at} | 来源: ${escapeHtml(msg.source)}</i>\n\n`
    fullText += `━━━━━━━━━━━━━━━\n\n\n`
    fullText += `<b>${escapeHtml(msg.content)}</b>`

    // 如果全文太长，分段发送
    if (fullText.length > 4000) {
      const chunks = []
      let remaining = fullText
      while (remaining.length > 0) {
        chunks.push(remaining.substring(0, 4000))
        remaining = remaining.substring(4000)
      }
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'HTML' })
      }
    } else {
      await ctx.reply(fullText, { parse_mode: 'HTML' })
    }

    await ctx.answerCallbackQuery()
  })

  // /clear - 清除历史数据
  bot.command('clear', async (ctx) => {
    const text = ctx.message.text.trim()
    const parts = text.split(/\s+/)
    // parts[0] = '/clear', parts[1] = 参数1, parts[2] = 参数2（可选）

    // 日期格式验证
    const isValidDate = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str)

    if (parts.length === 1) {
      // 无参数，显示帮助
      const totalMsgs = messageRepo.countAll()
      const totalSums = summaryRepo.countAll()
      await ctx.reply(
        `📊 当前数据统计\n• 消息: ${totalMsgs} 条\n• 总结: ${totalSums} 条\n\n` +
        '清除命令用法：\n' +
        '• /clear all - 清除所有消息和总结\n' +
        '• /clear 2026-02-10 - 清除指定日期的消息和总结\n' +
        '• /clear before 2026-02-01 - 清除该日期之前的消息和总结'
      )
      return
    }

    const arg1 = parts[1].toLowerCase()

    if (arg1 === 'all') {
      // 清除所有
      const msgResult = messageRepo.clearAll()
      const sumResult = summaryRepo.clearAll()
      await ctx.reply(`✅ 已清除所有数据\n• 消息: ${msgResult.changes} 条\n• 总结: ${sumResult.changes} 条`)

    } else if (arg1 === 'before' && parts[2] && isValidDate(parts[2])) {
      // 清除指定日期之前
      const dateStr = parts[2]
      const msgResult = messageRepo.clearBefore(dateStr)
      const sumResult = summaryRepo.clearBefore(dateStr)
      await ctx.reply(`✅ 已清除 ${dateStr} 之前的数据\n• 消息: ${msgResult.changes} 条\n• 总结: ${sumResult.changes} 条`)

    } else if (isValidDate(arg1)) {
      // 清除指定日期（消息和总结）
      const dateStr = arg1
      const msgResult = messageRepo.clearByDate(dateStr)
      const sumResult = summaryRepo.clearByDate(dateStr)
      await ctx.reply(`✅ 已清除 ${dateStr} 的数据\n• 消息: ${msgResult.changes} 条\n• 总结: ${sumResult.changes} 条`)

    } else {
      await ctx.reply(
        '❌ 参数格式错误\n\n' +
        '正确用法：\n' +
        '• /clear all\n' +
        '• /clear 2026-02-10\n' +
        '• /clear before 2026-02-01'
      )
    }
  })

  // /dedup - 查看 AI 去重记录
  bot.command('dedup', async (ctx) => {
    const text = ctx.message.text.trim()
    const parts = text.split(/\s+/)

    // 解析参数：/dedup 或 /dedup 5
    let limit = 5
    if (parts[1]) {
      const num = parseInt(parts[1], 10)
      if (!isNaN(num) && num > 0) {
        limit = Math.min(num, 20) // 最多20条
      }
    }

    const records = aiDedupRepo.getRecent(limit)
    const todayCount = aiDedupRepo.countToday()

    if (records.length === 0) {
      await ctx.reply('📭 暂无 AI 去重记录')
      return
    }

    await ctx.reply(`🔍 AI 事件去重记录（今日 ${todayCount} 条，显示最近 ${records.length} 条）：`)

    const escapeHtml = (str) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    for (const record of records) {
      const keptPreview = escapeHtml(record.kept_content.substring(0, 150))
      const removedPreview = escapeHtml(record.removed_content.substring(0, 150))
      const reason = escapeHtml(record.similarity_reason || '未说明')

      let msgText = `📅 <i>${record.created_at}</i>\n\n`
      msgText += `✅ <b>保留:</b> ${escapeHtml(record.kept_source)}\n`
      msgText += `${keptPreview}${record.kept_content.length > 150 ? '...' : ''}\n\n`
      msgText += `❌ <b>移除:</b> ${escapeHtml(record.removed_source)}\n`
      msgText += `${removedPreview}${record.removed_content.length > 150 ? '...' : ''}\n\n`
      msgText += `💡 <b>原因:</b> ${reason}\n`
      msgText += `━━━━━━━━━━━━━━━`

      await ctx.reply(msgText, { parse_mode: 'HTML' })
    }
  })

  // /fetch - 立即抓取、处理并逐条发布
  bot.command('fetch', async (ctx) => {
    if (!_scraper) {
      await ctx.reply('⚠️ Scraper 未初始化，请稍后再试')
      return
    }

    await ctx.reply('⏳ 开始抓取频道消息...')

    try {
      // 1. 抓取历史消息
      const messages = await _scraper.fetchAllHistory(50)
      if (messages.length === 0) {
        await ctx.reply('📭 本次抓取无新消息')
        return
      }

      await ctx.reply(`📥 抓取到 ${messages.length} 条消息，正在过滤...`)

      // 2. 过滤（包含 AI 事件去重）
      const filtered = await filterPipeline(messages, messageRepo, aiDedupRepo)
      if (filtered.length === 0) {
        await ctx.reply('📭 过滤后无新消息（可能都是重复的）')
        return
      }

      await ctx.reply(`🔍 过滤后 ${filtered.length} 条新消息，正在 AI 分类...`)

      // 3. AI 分类
      const classified = await classifyBatch(filtered)

      // 4. 存储
      messageRepo.saveMany(classified)
      await ctx.reply(`💾 已保存 ${classified.length} 条消息，正在逐条发布...`)

      // 5. 过滤垃圾分类
      const validMessages = classified.filter(m => m.category !== 'spam')

      if (validMessages.length === 0) {
        await ctx.reply('📭 无有效消息需要发布（均为垃圾分类）')
        return
      }

      // 6. 逐条发布到频道（间隔 500ms）
      await publishMessages(bot, validMessages, 500)

      await ctx.reply(`✅ 完成！已抓取 ${classified.length} 条消息，发布 ${validMessages.length} 条到频道`)
    } catch (err) {
      logger.error({ err }, '/fetch 命令执行失败')
      await ctx.reply(`❌ 执行失败: ${err.message}`)
    }
  })

  logger.info('Bot 命令注册完成')
}

module.exports = { registerCommands, setScraper }
