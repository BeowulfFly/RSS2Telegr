# RSS2Telegr

Telegram 频道聚合 Bot - 智能监控、分类、去重和发布频道消息

## 功能特性

- 📡 **多频道监控**: 同时监控多个 Telegram 频道的消息
- 🤖 **AI 智能分类**: 自动分类消息（科技、财经、生活等）并过滤垃圾内容
- 🔄 **智能去重**: 使用 AI 识别和去除相似内容
- 🌐 **智能翻译**: 自动识别英文消息并翻译成中文（基于 AI）
- ⏰ **定时发布**: 自动定时发布精选消息到目标频道
- 📊 **数据统计**: 提供详细的消息统计和分析
- 💬 **AI 聊天**: 支持自然语言交互，可以闲聊和问答

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
# Telegram Bot Token
BOT_TOKEN=your_bot_token

# 目标频道
TARGET_CHANNEL=@your_channel

# Telegram Client (MTProto)
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash

# 监控的源频道
SOURCE_CHANNELS=@channel1,@channel2,@channel3

# AI 模型配置（支持 OpenAI / DeepSeek 等）
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com

# 启用 AI 聊天功能
ENABLE_AI_CHAT=true

# 启用自动翻译（默认 true）
ENABLE_TRANSLATION=true
# 翻译阈值（中文占比低于此值时翻译，默认 0.2）
TRANSLATION_THRESHOLD=0.2

# 消息发布间隔（毫秒）
PUBLISH_INTERVAL_MS=3000
```

### 3. 运行

```bash
npm start
```

## 使用指南

### Bot 命令

- `/start` - 显示欢迎信息和命令列表
- `/status` - 查看运行状态和今日统计
- `/today` - 查看今日消息统计
- `/digest` - 生成今日整体总结
- `/summary` - 获取最近一次每日总结
- `/recent [数量]` - 查看最近消息
- `/search <关键词>` - 搜索消息
- `/dedup [数量]` - 查看 AI 去重记录
- `/fetch` - 立即抓取、处理并发布
- `/clear <选项>` - 清除历史数据

### AI 聊天功能

启用 `ENABLE_AI_CHAT=true` 后，您可以直接和 Bot 聊天：

**聊天示例：**

```
用户: "你好"
Bot: 你好！我是小盼 👋 有什么可以帮你的吗？

用户: "今天天气真不错"
Bot: 是啊！天气好的时候心情也会变好呢 😊 你今天有什么计划吗？

用户: "讲个笑话"
Bot: 好的！为什么程序员总是分不清万圣节和圣诞节？
     因为 Oct 31 == Dec 25 😄

用户: "AI 技术最近有什么新进展吗？"
Bot: AI 领域确实发展很快！最近比较热门的有大语言模型的应用、
     多模态 AI、以及 AI 在各行业的落地。你对哪个方向比较感兴趣？
```

**特点：**
- 支持闲聊、问答、讨论各种话题
- 友好自然的对话风格
- 简洁明了的回复（100-150字）
- 适当使用 emoji 增加趣味性

## 配置说明

### AI 模型配置

支持任何兼容 OpenAI API 的服务：

**使用 OpenAI:**
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL 留空使用默认
```

**使用 DeepSeek:**
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com
```

**使用其他兼容服务:**
```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=model_name
OPENAI_BASE_URL=https://your-api-endpoint.com
```

### 翻译配置

自动将英文消息翻译成中文：

```bash
# 启用翻译功能
ENABLE_TRANSLATION=true

# 翻译阈值（0.0-1.0）
# 当中文字符占比低于此值时，自动翻译成中文
# 默认 0.2，即中文字符少于 20% 时翻译
TRANSLATION_THRESHOLD=0.2
```

**工作原理：**
1. 系统自动检测消息语言
2. 如果中文字符占比低于阈值，判定为英文消息
3. 使用 AI 模型将英文翻译成中文
4. 保持原有格式（换行、列表等）
5. 翻译失败时自动降级到原文

**成本说明：**
- 使用 DeepSeek：约 ¥0.001-0.003/条消息
- 使用 GPT-4o-mini：约 ¥0.01-0.03/条消息

### 频率限制配置

为避免触发 Telegram API 频率限制：

```bash
# 默认 3 秒间隔（推荐）
PUBLISH_INTERVAL_MS=3000

# 如果频繁触发限制，增加到 5 秒
PUBLISH_INTERVAL_MS=5000
```

系统会自动处理 429 错误并重试。

## 技术架构

```
RSS2Telegr/
├── ai/                 # AI 相关模块
│   ├── index.js       # AI 客户端封装
│   ├── classifier.js  # 内容分类器
│   ├── deduplicator.js # 去重器
│   ├── digestGenerator.js # 总结生成器
│   ├── summarizer.js  # 摘要生成器
│   ├── chatbot.js     # AI 聊天功能
│   └── translator.js  # AI 翻译功能
├── bot/               # Telegram Bot
│   ├── index.js       # Bot 初始化
│   └── commands.js    # 命令处理器
├── scraper/           # 消息抓取
├── publisher/         # 消息发布
├── filter/            # 消息过滤
├── storage/           # 数据存储
└── scheduler/         # 定时任务
```

## 常见问题

### 1. 遇到 429 错误怎么办？

系统会自动处理 429 错误并重试。如果频繁出现，可以增加 `PUBLISH_INTERVAL_MS` 的值。

### 2. AI 聊天功能消耗多少 tokens？

每次聊天约消耗 300-500 tokens（包括系统提示词和对话内容）。

建议使用 DeepSeek 等成本较低的模型（约 ¥0.001/次对话）。

### 3. 如何禁用 AI 聊天功能？

设置 `ENABLE_AI_CHAT=false` 即可。

### 4. 支持哪些 AI 模型？

支持所有兼容 OpenAI API 格式的模型服务，包括：
- OpenAI (GPT-4, GPT-3.5)
- DeepSeek
- Azure OpenAI
- 本地部署的模型（如 Ollama + LiteLLM）

### 5. 如何禁用翻译功能？

设置 `ENABLE_TRANSLATION=false` 即可。

### 6. 翻译功能支持哪些语言？

当前版本支持：
- **英文 → 中文**: 自动检测并翻译
- 其他语言暂不支持自动翻译

### 7. 如何调整翻译灵敏度？

修改 `TRANSLATION_THRESHOLD` 参数：
- `0.1`: 更激进（中文少于 10% 就翻译）
- `0.2`: 默认值（推荐）
- `0.3`: 更保守（中文少于 30% 才翻译）

## 许可证

MIT

