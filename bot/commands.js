const config = require('../config')
const logger = require('../utils/logger')
const { filterPipeline } = require('../filter')
const { classifyBatch } = require('../ai/classifier')
const { generateDailyDigest } = require('../ai/digestGenerator')
const { publishMessages, publishMessagesWithProgress } = require('../publisher')
const { chatWithUser, detectConfirmation } = require('../ai/chatbot')

// 存储用户的待确认指令（userId -> { commands: Array, question: string, timestamp: number }）
const pendingCommands = new Map()

// 待确认指令过期时间（60秒）
const PENDING_EXPIRE_MS = 60 * 1000

// 存储命令处理函数（用于直接执行）
const commandHandlers = {}

// 用于存储 scraper 引用（由 index.js 注入）
let _scraper = null

/** 设置 scraper 引用（供 /fetch 命令使用） */
function setScraper(scraper) {
  _scraper = scraper
}

/**
 * 直接执行指令
 * @param {string} command - 指令名称（如 /status）
 * @param {object} ctx - grammy context
 */
async function executeCommand(command, ctx) {
  const handler = commandHandlers[command]
  if (handler) {
    try {
      await handler(ctx)
    } catch (err) {
      logger.error({ err, command }, '执行指令失败')
      await ctx.reply(`❌ 执行失败: ${err.message}`)
    }
  } else {
    await ctx.reply(`❌ 未知指令: ${command}`)
  }
}

/** 注册 Bot 命令 */
function registerCommands(bot, store) {
  const { messageRepo, summaryRepo, aiDedupRepo } = store

  // /start - 欢迎信息
  bot.command('start', async (ctx) => {
    const aiChatInfo = config.ai.enableChat 
      ? '\n\n💬 提示：除了使用命令，您也可以直接和我聊天！' 
      : ''

    await ctx.reply(
      '👋 欢迎使用频道聚合 Bot！\n\n' +
      '可用命令：\n' +
      '/status - 查看当前运行状态\n' +
      '/today - 查看今日消息统计\n' +
      '/digest - 生成今日整体总结（约300字）\n' +
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
      '  └ /clear before 2026-02-01 - 清除该日期之前' +
      aiChatInfo
    )
  })

  // /status - 运行状态
  commandHandlers['/status'] = async (ctx) => {
    const todayCount = messageRepo.countToday()
    const recentSummaries = summaryRepo.getRecent(1)
    const lastSummary = recentSummaries[0]

    let text = `📊 *运行状态*\n\n`
    text += `今日已采集消息：${todayCount} 条\n`
    text += `最近总结日期：${lastSummary ? lastSummary.date : '暂无'}`

    await ctx.reply(text, { parse_mode: 'Markdown' })
  }
  bot.command('status', commandHandlers['/status'])

  // /today - 今日消息统计
  commandHandlers['/today'] = async (ctx) => {
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
  }
  bot.command('today', commandHandlers['/today'])

  // /digest - 今日整体总结（约300字）
  commandHandlers['/digest'] = async (ctx) => {
    const messages = messageRepo.getToday()
    
    if (messages.length === 0) {
      await ctx.reply('📭 今日暂无消息，无法生成总结')
      return
    }

    // 过滤掉垃圾分类
    const validMessages = messages.filter(m => m.category !== 'spam')
    
    if (validMessages.length === 0) {
      await ctx.reply('📭 今日无有效消息（均为垃圾分类）')
      return
    }

    await ctx.reply(`⏳ 正在生成今日总结（${validMessages.length} 条消息）...`)

    try {
      const digest = await generateDailyDigest(validMessages)
      
      if (!digest) {
        await ctx.reply('❌ 总结生成失败，请稍后重试')
        return
      }

      const today = new Date().toISOString().split('T')[0]
      const text = `📋 *${today} 今日总结*\n（共 ${validMessages.length} 条消息）\n\n${digest}`

      if (text.length > 4000) {
        await ctx.reply(text.substring(0, 4000) + '\n\n...（内容过长已截断）', { parse_mode: 'Markdown' })
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown' })
      }
    } catch (err) {
      logger.error({ err }, '/digest 命令执行失败')
      await ctx.reply(`❌ 生成失败: ${err.message}`)
    }
  }
  bot.command('digest', commandHandlers['/digest'])

  // /summary - 最近一次总结
  commandHandlers['/summary'] = async (ctx) => {
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
  }
  bot.command('summary', commandHandlers['/summary'])

  // /recent - 最近消息（全部显示，默认10条，可加参数）
  // 用法: /recent 或 /recent 5 或 /recent 3-8
  commandHandlers['/recent'] = async (ctx) => {
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

      // 简洁格式：只显示内容和来源，正常字体
      let msgText = `${escapeHtml(content)}\n\n`
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
  }
  bot.command('recent', commandHandlers['/recent'])

  // /search - 关键词搜索消息
  // 用法: /search 关键词1 关键词2 （默认或）
  //       /search and 关键词1 关键词2 （且）
  commandHandlers['/search'] = async (ctx) => {
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
  }
  bot.command('search', commandHandlers['/search'])

  // 处理回调按钮（展开全文等）
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data

    // 处理展开全文按钮
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
    fullText += `${escapeHtml(msg.content)}`

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
  commandHandlers['/clear'] = async (ctx) => {
    const text = ctx.message?.text?.trim() || '/clear'
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
  }
  bot.command('clear', commandHandlers['/clear'])

  // /dedup - 查看 AI 去重记录
  commandHandlers['/dedup'] = async (ctx) => {
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
  }
  bot.command('dedup', commandHandlers['/dedup'])

  // /fetch - 立即抓取、处理并逐条发布（带实时进度条）
  commandHandlers['/fetch'] = async (ctx) => {
    if (!_scraper) {
      await ctx.reply('⚠️ Scraper 未初始化，请稍后再试')
      return
    }

    // 进度条生成函数
    const makeProgress = (percent, width = 10) => {
      const filled = Math.round(percent / 100 * width)
      const empty = width - filled
      return '█'.repeat(filled) + '░'.repeat(empty)
    }

    // 格式化进度消息
    const formatProgress = (step, totalSteps, stepName, detail = '') => {
      const percent = Math.round(step / totalSteps * 100)
      const bar = makeProgress(percent)
      let text = `🔄 *抓取进度* ${bar} ${percent}%\n\n`
      text += `📍 ${stepName}\n`
      if (detail) text += `${detail}\n`
      text += `\n步骤: ${step}/${totalSteps}`
      return text
    }

    // 发送初始进度消息
    const progressMsg = await ctx.reply(formatProgress(0, 6, '准备开始...'), { parse_mode: 'Markdown' })
    const chatId = progressMsg.chat.id
    const msgId = progressMsg.message_id

    // 更新进度消息
    const updateProgress = async (step, totalSteps, stepName, detail = '') => {
      try {
        await ctx.api.editMessageText(chatId, msgId, formatProgress(step, totalSteps, stepName, detail), { parse_mode: 'Markdown' })
      } catch (e) {
        // 忽略编辑失败（可能内容相同）
      }
    }

    try {
      // 1. 抓取历史消息
      await updateProgress(1, 6, '正在抓取频道消息...', '⏳ 连接频道中')
      const messages = await _scraper.fetchAllHistory(50)
      
      if (messages.length === 0) {
        await ctx.api.editMessageText(chatId, msgId, '📭 本次抓取无新消息')
        return
      }
      await updateProgress(1, 6, '抓取完成', `📥 获取到 ${messages.length} 条消息`)

      // 2. 过滤（包含 AI 事件去重）
      await updateProgress(2, 6, '正在过滤消息...', `🔍 处理 ${messages.length} 条消息`)
      const filtered = await filterPipeline(messages, messageRepo, aiDedupRepo)
      
      if (filtered.length === 0) {
        await ctx.api.editMessageText(chatId, msgId, '📭 过滤后无新消息（可能都是重复的）')
        return
      }
      await updateProgress(2, 6, '过滤完成', `✅ 保留 ${filtered.length} 条新消息`)

      // 3. AI 分类
      await updateProgress(3, 6, '正在 AI 分类...', `🤖 分析 ${filtered.length} 条消息`)
      const classified = await classifyBatch(filtered)
      await updateProgress(3, 6, 'AI 分类完成', `🏷️ 已分类 ${classified.length} 条消息`)

      // 4. 存储
      await updateProgress(4, 6, '正在保存到数据库...', `💾 存储 ${classified.length} 条消息`)
      messageRepo.saveMany(classified)

      // 5. 过滤垃圾分类
      const validMessages = classified.filter(m => m.category !== 'spam')
      const spamCount = classified.length - validMessages.length

      if (validMessages.length === 0) {
        await ctx.api.editMessageText(chatId, msgId, `📭 无有效消息需要发布\n（${spamCount} 条被标记为垃圾）`)
        return
      }
      await updateProgress(4, 6, '保存完成', `✅ 有效消息 ${validMessages.length} 条，垃圾 ${spamCount} 条`)

      // 6. 逐条发布到频道
      await updateProgress(5, 6, '正在发布到频道...', `📤 发布 ${validMessages.length} 条消息\n⏱️ 预计 ${Math.ceil(validMessages.length * config.publisher.intervalMs / 1000)} 秒`)
      
      // 使用带进度回调的发布函数
      let publishedCount = 0
      const onPublish = async (current, total) => {
        publishedCount = current
        const publishPercent = Math.round(current / total * 100)
        await updateProgress(5, 6, '正在发布到频道...', `📤 发布进度 ${current}/${total} (${publishPercent}%)`)
      }
      
      await publishMessagesWithProgress(bot, validMessages, config.publisher.intervalMs, onPublish)

      // 完成
      const finalText = `✅ *抓取完成！*\n\n` +
        `📥 抓取: ${messages.length} 条\n` +
        `🔍 过滤后: ${filtered.length} 条\n` +
        `🏷️ 分类后: ${classified.length} 条\n` +
        `📤 已发布: ${validMessages.length} 条\n` +
        `🗑️ 垃圾过滤: ${spamCount} 条`
      
      await ctx.api.editMessageText(chatId, msgId, finalText, { parse_mode: 'Markdown' })
    } catch (err) {
      logger.error({ err }, '/fetch 命令执行失败')
      try {
        await ctx.api.editMessageText(chatId, msgId, `❌ 执行失败: ${err.message}`)
      } catch (e) {
        await ctx.reply(`❌ 执行失败: ${err.message}`)
      }
    }
  }
  bot.command('fetch', commandHandlers['/fetch'])

  // 处理所有非命令消息（AI 聊天）
  if (config.ai.enableChat) {
    bot.on('message:text', async (ctx) => {
      const text = ctx.message.text
      const userId = ctx.from.id

      // 跳过以 / 开头的消息（已被命令处理器处理）
      if (text.startsWith('/')) {
        // 清除该用户的待确认状态
        pendingCommands.delete(userId)
        return
      }

      try {
        logger.info({ userId, username: ctx.from.username, text }, '收到非命令消息')

        // 1. 检查是否有待确认的指令
        const pending = pendingCommands.get(userId)
        if (pending && Date.now() - pending.timestamp < PENDING_EXPIRE_MS) {
          // 使用 AI 判断用户回复是肯定还是否定
          const confirmation = await detectConfirmation(text, pending.question)
          
          if (confirmation === 'confirm') {
            // 用户确认，直接执行指令
            const cmd = pending.commands[0]
            pendingCommands.delete(userId)
            
            logger.info({ userId, command: cmd.command }, '用户确认执行指令')
            await ctx.reply(`✅ 好的老板，马上执行~`)
            await executeCommand(cmd.command, ctx)
            return
          } else if (confirmation === 'deny') {
            // 用户否定，清除状态
            pendingCommands.delete(userId)
            await ctx.reply('好的老板，还有什么需要帮忙的吗？')
            return
          }
          // unknown 继续正常聊天流程，可能用户在说别的
        }

        // 2. 处理聊天（会自动检测指令意图）
        const result = await chatWithUser(text, {
          userId,
          username: ctx.from.username,
        })

        // 3. 如果检测到指令意图，保存待确认状态并询问
        if (result.type === 'command' && result.commands) {
          pendingCommands.set(userId, {
            commands: result.commands,
            question: result.content, // 保存问题用于 AI 判断上下文
            timestamp: Date.now(),
          })
        }

        await ctx.reply(result.content)
      } catch (err) {
        logger.error({ err, text }, '处理非命令消息失败')
        await ctx.reply('抱歉，我现在有点忙，稍后再聊吧 😅')
      }
    })
    logger.info('AI 聊天功能已启用')
  } else {
    logger.info('AI 聊天功能已禁用')
  }

  logger.info('Bot 命令和消息处理器注册完成')
}

module.exports = { registerCommands, setScraper }
