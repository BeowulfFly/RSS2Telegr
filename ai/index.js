const OpenAI = require('openai')
const config = require('../config')
const logger = require('../utils/logger')

let client = null

/** 获取 OpenAI 客户端单例 */
function getClient() {
  if (!client) {
    const opts = { apiKey: config.ai.apiKey }
    if (config.ai.baseURL) {
      opts.baseURL = config.ai.baseURL
    }
    client = new OpenAI(opts)
    logger.info({ model: config.ai.model }, 'OpenAI 客户端已初始化')
  }
  return client
}

/** 检查是否是需要使用 max_completion_tokens 的新模型 */
function isNewModel(model) {
  // o1, o3, gpt-5 系列等新模型使用 max_completion_tokens
  return /^(o1|o3|gpt-5)/i.test(model)
}

/**
 * 调用 ChatGPT 完成对话
 * @param {Array} messages - OpenAI messages 数组
 * @param {object} opts - 额外参数
 * @returns {string} 助手回复内容
 */
async function chat(messages, opts = {}) {
  const ai = getClient()
  const model = config.ai.model
  const maxTokens = opts.maxTokens ?? 2000

  // 构建请求参数，根据模型类型选择不同的 token 限制参数
  const requestParams = {
    model,
    messages,
  }

  // 新模型不支持 temperature 和 max_tokens，使用 max_completion_tokens
  if (isNewModel(model)) {
    requestParams.max_completion_tokens = maxTokens
  } else {
    requestParams.temperature = opts.temperature ?? 0.3
    requestParams.max_tokens = maxTokens
  }

  const response = await ai.chat.completions.create(requestParams)
  const content = response.choices[0]?.message?.content
  return (content || '').trim()
}

module.exports = { getClient, chat }
