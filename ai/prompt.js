/** 消息分类 Prompt */
function classifyPrompt(text) {
  return [
    {
      role: 'system',
      content: `你是一个消息分类助手。请对用户发送的消息内容进行分类，并返回 JSON 格式结果。

分类类别包括：
- 科技 (tech)
- 金融 (finance)
- 加密货币 (crypto)
- 新闻 (news)
- 教程 (tutorial)
- 工具推荐 (tools)
- 观点评论 (opinion)
- 其他 (other)
- 垃圾信息 (spam)

返回格式（严格 JSON，不要多余文字）：
{"category": "分类英文名", "label": "分类中文名", "confidence": 0.0-1.0}`,
    },
    {
      role: 'user',
      content: text,
    },
  ]
}

/** 每日总结 Prompt */
function summarizePrompt(messagesText) {
  return [
    {
      role: 'system',
      content: `你是一个信息摘要助手。请根据提供的消息列表，生成一份结构化的每日总结。

要求：
1. 按分类分组总结
2. 每个分类提取 3-5 条最有价值的信息要点
3. 用简洁的中文表述
4. 每条要点后面不换行，直接附上来源（格式：要点内容 — 来源名）
5. 每个分类最后给出一句小结，用绿色标记突出显示（格式：🟢 <b>小结：xxx</b>）
6. 使用 Telegram 兼容的 HTML 格式（<b>加粗</b>、<i>斜体</i>）
7. 各部分之间用空行分隔，保持良好的可读性
8. 每个要点之间也要有空行
9. 不需要最后的综合观察，每个分类自带小结即可

输出格式示例：

📊 <b>2026-02-10 每日信息总结</b>


<b>🔧 科技</b>

• 某AI模型发布重大更新 — @techChannel

• 新编程语言获得关注 — @devNews

• 开源项目突破百万星标 — @github

🟢 <b>小结：今日科技领域主要关注AI发展和开源生态</b>


<b>💰 金融</b>

• 市场波动加剧，投资者观望 — @financeDaily

• 新政策出台影响预期 — @newsChannel

🟢 <b>小结：金融方面情绪谨慎，政策导向明显</b>


<b>💬 观点评论</b>

• 关于职场年龄的讨论引发共鸣 — @lifeChannel

• 教育话题持续发酵 — @socialNews

🟢 <b>小结：今日讨论热点集中在社会问题</b>`,
    },
    {
      role: 'user',
      content: `以下是今日采集的 ${messagesText.split('\n---\n').length} 条消息：\n\n${messagesText}`,
    },
  ]
}

/** 分类小结 Prompt（只生成一句话小结） */
function categorySummaryPrompt(categoryLabel, messagesText) {
  return [
    {
      role: 'system',
      content: `你是一个信息摘要助手。请根据提供的消息列表，用一句简洁的中文总结这些消息的共同主题或趋势。

要求：
1. 只输出一句话，不要换行
2. 不要有前缀如"小结："
3. 简洁明了，20-50字`,
    },
    {
      role: 'user',
      content: `以下是【${categoryLabel}】分类的消息：\n\n${messagesText}`,
    },
  ]
}

/** 从垃圾信息中提取关键词 Prompt */
function extractSpamKeywordsPrompt(messagesText) {
  return [
    {
      role: 'system',
      content: `你是一个垃圾信息分析助手。请从提供的垃圾消息中提取特征关键词，用于未来自动过滤类似内容。

要求：
1. 提取 3-5 个最具代表性的关键词或短语
2. 关键词应该能识别出该类垃圾信息的特征
3. 返回格式：用逗号分隔的关键词列表
4. 只输出关键词，不要有其他文字

示例输出：免费领取,加群,私聊,优惠券`,
    },
    {
      role: 'user',
      content: `以下是被标记为垃圾信息的消息：\n\n${messagesText}`,
    },
  ]
}

/** 事件去重 Prompt（批量比较消息，识别相同事件）*/
function eventDedupPrompt(messagesJson) {
  return [
    {
      role: 'system',
      content: `你是一个消息去重助手。请分析以下消息列表，找出讲述**相同事件**的消息组。

判断标准：
- 相同事件：描述同一件事、同一个新闻、同一个公告，只是表述不同
- 不同事件：即使话题相似，但是不同的具体事件（如不同公司的融资消息是不同事件）

返回 JSON 格式：
{
  "groups": [
    {
      "keep": 0,
      "remove": [1, 2],
      "reason": "简述为什么这些消息是同一事件"
    }
  ]
}

说明：
- keep: 保留的消息索引（选择信息最完整或最早的一条）
- remove: 要移除的消息索引数组
- reason: 简短说明相似原因（10-30字）
- 如果没有重复，返回 {"groups": []}
- 只返回 JSON，不要其他文字`,
    },
    {
      role: 'user',
      content: `请分析以下 ${JSON.parse(messagesJson).length} 条消息：\n\n${messagesJson}`,
    },
  ]
}

module.exports = { classifyPrompt, summarizePrompt, categorySummaryPrompt, extractSpamKeywordsPrompt, eventDedupPrompt }
