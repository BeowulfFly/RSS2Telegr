// 测试翻译功能
require('dotenv').config()
const { translateToZh, isEnglishDominant } = require('./ai/translator')
const logger = require('./utils/logger')

async function testTranslation() {
  logger.info('========== 翻译功能测试 ==========')
  
  // 测试用例 1: 纯英文文本
  const englishText = `
Breaking News: OpenAI Releases GPT-5
OpenAI has just announced the release of GPT-5, the latest version of their language model. 
The new model features improved reasoning capabilities and enhanced performance across various tasks.
Key features include:
- Better multilingual support
- Faster response times
- Enhanced code generation
  `.trim()
  
  logger.info('\n--- 测试 1: 纯英文文本 ---')
  logger.info('原文:', englishText.substring(0, 100) + '...')
  const isEnglish1 = isEnglishDominant(englishText)
  logger.info('是否为英文主导:', isEnglish1)
  
  if (isEnglish1) {
    const translated1 = await translateToZh(englishText)
    logger.info('译文:', translated1.substring(0, 150) + '...')
  }
  
  // 测试用例 2: 中文文本
  const chineseText = `
最新消息：OpenAI 发布 GPT-5
OpenAI 刚刚宣布发布其语言模型的最新版本 GPT-5。
新模型具有改进的推理能力和各项任务的增强性能。
  `.trim()
  
  logger.info('\n--- 测试 2: 中文文本 ---')
  logger.info('原文:', chineseText)
  const isEnglish2 = isEnglishDominant(chineseText)
  logger.info('是否为英文主导:', isEnglish2)
  
  const result2 = await translateToZh(chineseText)
  logger.info('结果:', result2 === chineseText ? '跳过翻译（正确）' : '进行了翻译（异常）')
  
  // 测试用例 3: 中英混合文本
  const mixedText = `
AI 技术突破: OpenAI releases GPT-5 with enhanced capabilities
这是一个包含中英文混合的测试文本。The new model shows significant improvements.
  `.trim()
  
  logger.info('\n--- 测试 3: 中英混合文本 ---')
  logger.info('原文:', mixedText)
  const isEnglish3 = isEnglishDominant(mixedText)
  logger.info('是否为英文主导:', isEnglish3)
  
  const result3 = await translateToZh(mixedText)
  logger.info('处理结果:', result3)
  
  logger.info('\n========== 测试完成 ==========')
}

// 运行测试
testTranslation().catch(err => {
  logger.error({ err }, '测试失败')
  process.exit(1)
})
