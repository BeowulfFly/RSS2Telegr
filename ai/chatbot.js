const { chat } = require('./index')
const logger = require('../utils/logger')

/**
 * 指令配置（包含指令、中文名称、描述、触发关键词）
 * 关键词设计原则：使用短语而非单词，避免误匹配
 */
const COMMANDS = {
  start: {
    command: '/start',
    name: '开始',
    description: '显示欢迎信息和命令列表',
    keywords: ['怎么用', '使用说明', '有什么功能', '命令列表', '所有命令', '帮我看看命令'],
  },
  status: {
    command: '/status',
    name: '运行状态',
    description: '查看当前运行状态',
    keywords: ['运行状态', '运行情况', '运行得怎么样', '机器人状态', 'bot状态'],
  },
  today: {
    command: '/today',
    name: '今日统计',
    description: '查看今日消息统计',
    keywords: ['今日统计', '今天统计', '今天消息', '今日消息', '今天有多少', '今天抓了多少'],
  },
  digest: {
    command: '/digest',
    name: '今日总结',
    description: '获取今日整体总结',
    keywords: ['生成总结', '今日总结', '今天总结', '做个总结', '帮我总结'],
  },
  summary: {
    command: '/summary',
    name: '每日总结',
    description: '获取最近一次每日总结',
    keywords: ['每日总结', '日报', '上次总结', '之前的总结'],
  },
  recent: {
    command: '/recent',
    name: '最近消息',
    description: '查看最近消息（默认10条）',
    keywords: ['最近消息', '最新消息', '看看消息', '查看消息', '最近抓的'],
  },
  search: {
    command: '/search',
    name: '搜索',
    description: '关键词搜索消息',
    keywords: ['搜索消息', '搜一下', '查找消息', '找一下', '帮我搜', '帮我找'],
  },
  dedup: {
    command: '/dedup',
    name: '去重记录',
    description: '查看 AI 去重记录对比',
    keywords: ['去重记录', '重复记录', '去重对比', '哪些重复'],
  },
  fetch: {
    command: '/fetch',
    name: '立即抓取',
    description: '立即抓取、处理并发布消息',
    keywords: ['今天新消息','立即抓取', '马上抓取', '现在抓取', '手动抓取', '抓取一下', '更新消息', '刷新消息'],
  },
  clear: {
    command: '/clear',
    name: '清除数据',
    description: '清除历史数据',
    keywords: ['清除数据', '清空数据', '删除数据', '清理数据', '清除历史', '清空历史'],
  },
}

/**
 * 检测用户消息是否匹配指令关键词
 * @param {string} userMessage - 用户输入的消息
 * @returns {{matched: boolean, commands: Array}} 匹配结果
 */
function detectCommandIntent(userMessage) {
  const text = userMessage.toLowerCase()
  const matchedCommands = []

  for (const [key, cmd] of Object.entries(COMMANDS)) {
    for (const keyword of cmd.keywords) {
      if (text.includes(keyword)) {
        matchedCommands.push(cmd)
        break // 一个指令只匹配一次
      }
    }
  }

  return {
    matched: matchedCommands.length > 0,
    commands: matchedCommands,
  }
}

/**
 * 使用 AI 检测用户回答是肯定还是否定
 * @param {string} text - 用户输入
 * @param {string} question - 之前问用户的问题（上下文）
 * @returns {Promise<'confirm'|'deny'|'unknown'>}
 */
async function detectConfirmation(text, question = '') {
  const prompt = [
    {
      role: 'system',
      content: `你是一个意图判断助手。判断用户的回复是"肯定"、"否定"还是"其他"。

规则：
- 肯定：表示同意、确认、愿意执行（如：是、对、好、行、没问题、冲、来吧、搞起、可以、OK、嗯、走起等）
- 否定：表示拒绝、取消、不愿意（如：不、不是、不要、算了、取消、别、no、不用了等）
- 其他：无法判断或用户在说别的事情

只返回一个词：confirm / deny / unknown`,
    },
    {
      role: 'user',
      content: question ? `问题：${question}\n用户回复：${text}` : text,
    },
  ]

  try {
    const response = await chat(prompt, { temperature: 0.1, maxTokens: 20 })
    const result = response.toLowerCase().trim()
    
    if (result.includes('confirm')) return 'confirm'
    if (result.includes('deny')) return 'deny'
    return 'unknown'
  } catch (err) {
    logger.error({ err, text }, 'AI 判断确认意图失败')
    return 'unknown'
  }
}

/**
 * 格式化指令确认消息
 * @param {Array} commands - 匹配到的指令数组
 * @returns {string} 格式化后的提示消息
 */
function formatCommandSuggestion(commands) {
  if (commands.length === 1) {
    const cmd = commands[0]
    return `老板，你是想${cmd.description}吗？`
  }

  // 多个匹配，列出选项
  const list = commands.map((cmd, i) => `${i + 1}. ${cmd.description}`).join('\n')
  return `老板，你是想：\n\n${list}\n\n请回复数字选择，或直接告诉我~`
}

/**
 * AI 聊天回复（处理非命令消息）
 * @param {string} userMessage - 用户输入的消息
 * @param {object} context - 上下文信息（可选）
 * @returns {Promise<{type: 'command'|'chat', content: string, commands?: Array}>} 回复内容
 */
async function chatWithUser(userMessage, context = {}) {
  // 1. 先检测是否匹配指令关键词
  const intentResult = detectCommandIntent(userMessage)
  if (intentResult.matched) {
    logger.debug({ userMessage, commands: intentResult.commands.map(c => c.command) }, '检测到指令意图')
    return {
      type: 'command',
      content: formatCommandSuggestion(intentResult.commands),
      commands: intentResult.commands, // 返回匹配的指令供后续使用
    }
  }

  // 2. 没有匹配指令，使用 AI 聊天
  const systemPrompt = `你是一个友好的 AI 聊天助手，可以叫"小盼"。

你的特点：
- 友好、热情、乐于助人
- 知识渊博，可以聊各种话题
- 回复简洁明了，不啰嗦
- 适当使用 emoji 让对话更生动

回复风格：
- 使用口语化、自然的语气
- 回复控制在 100-150 字以内
- 根据话题调整语气（严肃/轻松）
- 可以主动提问，让对话更有趣

你可以：
- 闲聊、讲笑话、分享有趣的知识
- 回答各种问题（科技、生活、文化等）
- 提供建议和帮助
- 讨论新闻、热点话题

注意事项：
- 保持友好和尊重
- 不确定的事情诚实说不知道
- 避免敏感政治话题
- 不要编造事实`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  try {
    const response = await chat(messages, { temperature: 0.7, maxTokens: 500 })
    logger.debug({ userMessage, response }, 'AI 聊天回复')
    return {
      type: 'chat',
      content: response,
    }
  } catch (err) {
    logger.error({ err, userMessage }, 'AI 聊天失败')
    return {
      type: 'chat',
      content: '抱歉，我现在有点忙，稍后再聊吧 😅',
    }
  }
}

module.exports = { chatWithUser, detectCommandIntent, detectConfirmation, COMMANDS }
