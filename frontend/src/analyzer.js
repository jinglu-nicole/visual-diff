/**
 * [WHO]: 提供 compareImages(), AnalyzeError 类, PHASES 常量
 * [FROM]: utils.js 提供图片预处理 (base64/颜色提取)
 * [TO]: App.jsx 调用
 * [HERE]: frontend/src/analyzer.js — Python analyzer.py 的纯前端等价实现；含进度回调和结构化错误
 */

import { imageToBase64, getMediaType, extractDominantColors } from './utils.js'

const MODEL = 'claude-opus-4-5-20251101'
const DOLLARS_PER_M_TOKENS = 3.0
const MODEL_MAX_TOKENS = 64000

/** 分析阶段常量 */
export const PHASES = {
  PREPROCESSING: { key: 'preprocessing', label: '图片预处理', icon: '🖼️', step: 1, total: 4 },
  REQUESTING:    { key: 'requesting',    label: '发送请求',   icon: '📡', step: 2, total: 4 },
  WAITING:       { key: 'waiting',       label: 'AI 分析中',  icon: '🧠', step: 3, total: 4 },
  PARSING:       { key: 'parsing',       label: '解析结果',   icon: '📋', step: 4, total: 4 },
}

/** 错误类型枚举 */
export const ERROR_TYPES = {
  NETWORK:       'network',
  CORS:          'cors',
  AUTH:          'auth',
  RATE_LIMIT:    'rate_limit',
  MODEL:         'model',
  SERVER:        'server',
  OVERLOADED:    'overloaded',
  IMAGE:         'image',
  PARSE:         'parse',
  UNKNOWN:       'unknown',
}

/** 结构化错误 */
export class AnalyzeError extends Error {
  constructor(type, message, { detail = '', suggestions = [], retryable = false } = {}) {
    super(message)
    this.name = 'AnalyzeError'
    this.type = type
    this.detail = detail
    this.suggestions = suggestions
    this.retryable = retryable
  }
}

/** 根据 HTTP 状态码和错误数据构造结构化错误 */
function classifyApiError(status, errData) {
  const msg = errData?.error?.message || ''
  const errType = errData?.error?.type || ''

  if (status === 401 || status === 403) {
    return new AnalyzeError(ERROR_TYPES.AUTH, 'API Key 无效或已过期', {
      detail: msg,
      suggestions: [
        '检查 API Key 是否正确、完整',
        '确认 Key 是否有访问该模型的权限',
        '如果是新创建的 Key，等几分钟后重试',
      ],
    })
  }

  if (status === 429) {
    return new AnalyzeError(ERROR_TYPES.RATE_LIMIT, '请求过于频繁，已被限流', {
      detail: msg,
      suggestions: [
        '等待 30-60 秒后重试',
        '检查 API 用量配额是否已满',
      ],
      retryable: true,
    })
  }

  if (status === 404) {
    return new AnalyzeError(ERROR_TYPES.MODEL, `模型 ${MODEL} 不可用`, {
      detail: msg,
      suggestions: [
        '确认服务商是否支持该模型',
        '检查服务商 URL 是否正确',
      ],
    })
  }

  if (status === 529 || errType === 'overloaded_error') {
    return new AnalyzeError(ERROR_TYPES.OVERLOADED, 'API 服务过载', {
      detail: msg,
      suggestions: [
        '服务器负载过高，请稍后重试',
        '通常等待 1-5 分钟即可恢复',
      ],
      retryable: true,
    })
  }

  if (status >= 500) {
    return new AnalyzeError(ERROR_TYPES.SERVER, `服务端错误 (${status})`, {
      detail: msg,
      suggestions: [
        '这是服务端问题，非你的操作导致',
        '稍后重试，如持续出现请联系服务商',
      ],
      retryable: true,
    })
  }

  return new AnalyzeError(ERROR_TYPES.UNKNOWN, msg || `请求失败 (${status})`, {
    detail: `HTTP ${status}`,
    suggestions: ['检查网络和服务商 URL 配置'],
    retryable: true,
  })
}

function dollarsToTokens(dollars) {
  return Math.floor(dollars * 1_000_000 / DOLLARS_PER_M_TOKENS)
}

function buildPrompt(colors1, colors2, canvasWidth, canvasHeight, artDims, gameDims) {
  // 计算适配信息
  const designW = canvasWidth, designH = canvasHeight
  let adaptationInfo = ''
  if (artDims && gameDims) {
    const artRatio = (artDims.width / artDims.height).toFixed(3)
    const gameRatio = (gameDims.width / gameDims.height).toFixed(3)
    const designRatio = (designW / designH).toFixed(3)
    // SGUI 缩放逻辑：长边缩放适配，短边拉伸
    const gameScale = Math.min(gameDims.width / designW, gameDims.height / designH)
    adaptationInfo = `
━━━━━━━━━━━━━━━━━━━━━━━━
📏 图片实际分辨率（自动检测）
━━━━━━━━━━━━━━━━━━━━━━━━
设计分辨率：${designW}×${designH}（宽高比 ${designRatio}）
设计稿图片：${artDims.width}×${artDims.height}（宽高比 ${artRatio}）
实机截图：${gameDims.width}×${gameDims.height}（宽高比 ${gameRatio}）
实机→设计 缩放因子：${gameScale.toFixed(4)}

适配分析提示：
${gameRatio === designRatio ? '• 实机截图与设计分辨率宽高比一致，可直接逐像素比较位置/间距' :
  gameRatio > designRatio ? `• 实机截图比设计分辨率更宽（${gameRatio} > ${designRatio}），高度方向 1:1 缩放，宽度方向有额外拉伸区域。靠左右边缘的元素位置可能因拉伸而与设计稿不同，这是正常适配行为，不算问题` :
  `• 实机截图比设计分辨率更窄（${gameRatio} < ${designRatio}），整体缩小后高度方向拉伸。所有元素视觉上更小，比较间距时需除以缩放因子 ${gameScale.toFixed(4)} 换算到设计分辨率坐标系`}
${artRatio !== designRatio ? `• ⚠ 设计稿图片宽高比（${artRatio}）与设计分辨率（${designRatio}）不一致，可能是截图时带了额外区域或裁切不准` : ''}
`
  }

  return `你是一位专业的游戏 GUI 还原度审查专家。请对比以下两张图片：
- 图1：UI 设计效果图（目标规范）
- 图2：游戏实机截图（实际还原）

━━━━━━━━━━━━━━━━━━━━━━━━
🎨 颜色参考数据（本地算法预提取，供颜色分析参考）
━━━━━━━━━━━━━━━━━━━━━━━━
图1 主色：${colors1}
图2 主色：${colors2}

请在分析色彩时优先参考上述色值，结合视觉观察判断颜色差异，避免凭感觉估色。
所有颜色描述统一使用 **#HEX (sRGB色名)** 格式，十六进制色值以实际图像取色为准，括号内附上最接近的 CSS/sRGB 标准色名作为语义描述，例如：#F26522 (Orange Red)、#FEEEED (Lavender Blush)、#7A1723 (Dark Red)。
${adaptationInfo}

━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 分析前提（请严格遵守）
━━━━━━━━━━━━━━━━━━━━━━━━
1. 【忽略文本内容】两图文字内容可能不同（名称、数值等），只对比文字的视觉样式（字体/字号/字重/颜色）
2. 【忽略状态位置】Tab 选中态、按钮激活态等所在位置可以不同，对比的是「同一状态的样式规范」是否一致
3. 【间距是固定值】元素组之间的 padding/gap 是设计 token，与组内内容长短无关。例如文字段落和下方列表之间的间距应为固定值，不受行数影响。请识别组间间距并判断还原是否正确
4. 【设计分辨率为 ${canvasWidth}×${canvasHeight}】这是项目的基准分辨率——所有 UI 元素在此分辨率下完美摆放，美术效果图也基于此分辨率制作。如果实机截图分辨率与设计分辨率不一致，需考虑缩放因子（scale = 实机短边 / 设计短边），所有间距/大小的比较应换算到设计分辨率坐标系下再判断差异
5. 【进度条/滑块类组件】进度条的填充比例、数值、百分比等是运行时动态数据，两图必然不同，**完全忽略进度值差异，不得因此扣分**。只分析：进度条整体容器的位置（与父容器/画布的 padding）、进度条的尺寸（宽度/高度）、圆角、背景色/填充色的样式还原
6. 【列表/网格类组件】忽略列表项数量差异，只关注：单个列表项的尺寸大小、列表项内部的信息元素构成（**有无**名称文案、数量文字、图标等，有无本身就是差异，必须标出**）、列表项之间的 padding/gap
7. 【头像/角色/图标列表】重点检查单个元素的尺寸是否与设计稿一致，忽略数量差异
8. 【按钮/操作区块必须识别】界面角落（尤其右下角、右上角）的按钮组、功能按钮区块是独立的功能区块，必须在组件树中单独列出。对于靠近画布边缘的按钮，必须分析其与画布底边、右边的 padding 差异
9. 【动态粒子/特效识别】游戏截图中可能存在实时粒子特效（光芒、火焰、飘散碎片、闪光、烟雾、能量流动等），这些在设计稿中可能以静态示意图呈现或完全不存在。如果发现两图在某区域的亮度、色彩、模糊度、遮挡关系存在差异，且该差异符合动态粒子特效的视觉特征，请在问题描述末尾标注 \u26A1 可能由动态粒子/特效导致，并酌情降低该问题的严重等级

━━━━━━━━━━━━━━━━━━━━━━━━
📐 屏幕适配与设计分辨率规则
━━━━━━━━━━━━━━━━━━━━━━━━
游戏 UI 基于设计分辨率 ${canvasWidth}×${canvasHeight} 制作，使用锚点（Anchor）系统进行布局适配。

**适配缩放逻辑**：确保长边缩放适配屏幕后，短边拉伸适配。
- 如果实机分辨率比设计分辨率更宽（如 2380×1080 vs 1920×1080），高度 1:1 不变，宽度方向拉伸
- 如果实机分辨率比设计分辨率更窄，整体按比例缩小，然后高度方向拉伸
- 因此分析间距时，需要先判断实机截图的实际分辨率，再换算到设计分辨率坐标系比较

**常见锚点布局模式**：

• **固定角点（Corner）**：元素锚定在画布某个角，与该角保持固定距离，不随画布缩放改变——靠近画布边缘的元素通常采用此模式，其与画布边界的 padding 是固定值
• **拉伸适配（Stretch-Stretch）**：元素四边同时锚定父容器四边，随父容器等比拉伸——此类元素的内边距（Left/Right/Top/Bottom）保持固定，元素尺寸自动计算
• **水平拉伸（Stretch-Horizontal）/ 垂直拉伸（Stretch-Vertical）**：仅一个方向跟随父容器拉伸
• **中心锚定（Center）**：元素锚定在父容器中心，尺寸固定，位置随中心偏移
• **九宫格（9-Slice）**：图片素材的四角固定不缩放，边和中心区域拉伸，常用于按钮、面板背景

分析时请根据元素在画布中的位置和行为，推断其适配模式，并据此判断间距是否正确。

━━━━━━━━━━━━━━━━━━━━━━━━
📦 间距与容器分析规则
━━━━━━━━━━━━━━━━━━━━━━━━
• **设计分辨率边界 padding**：靠近画布边缘的元素，需分析其与设计分辨率画布四边的固定间距（换算到设计分辨率坐标系）
• **容器必须递归拆解（至少 3 层）**：
  - 第 1 层：识别页面中的主要功能区块（如：左侧角色列表区、右下奖励区、底部进度条区等）
  - 第 2 层：每个区块内再拆分子容器（如：奖励区 → 奖励标题 + 奖励列表容器）
  - 第 3 层：每个子容器内再拆分最小单元（如：奖励列表容器 → 单个奖励项）
  - 每一层都需要分析：该容器与父容器的 padding、该容器内子元素之间的 gap
• **组间 gap**：不同容器/元素组之间的间距，是独立于各组内容长度的固定值
• **信息元素完整性**：在分析每个最小单元时，逐一列出其包含的信息元素（图标、标题、副标题、数量、标签等），对比两图中该单元的信息元素是否一致，**有无差异必须标出**

━━━━━━━━━━━━━━━━━━━━━━━━
📐 分析流程（请按顺序执行）
━━━━━━━━━━━━━━━━━━━━━━━━

## 第一步：组件识别与状态划分（分析基础）

在开始任何对比之前，先完成以下工作：
1. 按容器层级递归拆解界面（至少 3 层），识别所有功能区块、子容器、最小单元
2. 对每个组件，识别其在两图中分别处于什么状态（默认/选中/激活/禁用等）
3. 忽略状态所在位置的差异，以状态类型为单位进行后续分析

输出格式示例：
\`\`\`
【组件树】
└─ 奖励区域（容器）
   ├─ 奖励标题
   └─ 奖励列表（容器）
      └─ 奖励项（默认态）× N
         ├─ 奖励图标
         ├─ 奖励名称（文字）
         └─ 奖励数量（文字）
\`\`\`

## 第二步：逐组件/逐状态分析

对第一步识别出的每个组件，按以下优先级依次分析：

**P1 位置**
  • 该组件/状态在画布或父容器中的位置是否正确
  • 对齐方式（左/居中/右）是否一致
  • 推断锚点适配模式，判断位置偏移原因

**P2 大小（含字号）**
  • 组件自身的宽高尺寸是否与设计稿一致
  • 组件内文字的字号是否正确
  • 图标、头像等子元素的宽高比是否正确

**P3 界面边距与元素间间距**
  • 该组件与画布边界的 padding（如靠边）
  • 该组件与父容器的 padding
  • 该组件内子元素之间的 gap
  • 所有间距均为固定值，与内容长度无关

**P4 字体样式**
  • 字重、行高、字间距
  • 各状态下的文字颜色（sRGB 格式）

**P5 色彩**
  • 背景色、前景色、强调色，全部使用 #HEX (sRGB色名) 格式描述
  • 渐变、透明度、叠加模式

  **⚠ 色彩分析核心原则（必须遵守）**：
  • **AI 视觉模型对颜色的识别精度有限**，你看到的颜色可能因为压缩、背景干扰、光照叠加而失真。因此色彩维度的分析必须保守谨慎
  • **区分文字颜色和背景颜色**：文字颜色不要被其所在背景色干扰。深色背景上的白色文字仍然是白色，不要因为视觉上感觉偏暗就报告为不同颜色
  • **相近色不报差异**：如果两图同一元素的颜色看起来属于同一色系、同一明度区间（如都是白色、都是深灰、都是同一种蓝），不要标记为问题。只有颜色明显属于不同色相或明度差异巨大时才报告
  • **不确定时标注而非断言**：如果你对某个颜色差异不确定，在问题描述末尾标注"(色值待确认)"，不要给出你不确信的具体 HEX 值
  • **本地预提取的主色仅供参考**：上方提供的主色数据是全图统计色，不代表某个具体组件的颜色。具体组件颜色以你的视觉观察为准，但请遵守上述保守原则

**P6 图标与素材**
  • 图标风格、描边、圆角、9-Slice

**P7 背景与可读性**
  • 该组件/容器所在位置的背景色彩、亮度是否与设计稿一致
  • 背景变化是否导致前景信息（文字、图标）可读性下降
  • 对比度是否足够（深色背景配浅色文字，或反之）

**P8 视觉层级**
  • 阴影、描边、层叠关系

━━━━━━━━━━━━━━━━━━━━━━━━
📋 输出格式（严格按以下结构输出）
━━━━━━━━━━━━━━━━━━━━━━━━

## 组件树

按层级列出所有识别到的组件，格式规范如下：
- 第 1 层（主功能区块）：\`## ▌区块名称\`，加粗醒目
- 第 2 层（子容器）：\`### └ 容器名称\`
- 第 3 层（最小单元）：\`- ◦ 组件名称（状态）\`
- 第 4 层及以下（子元素）：\`  - · 子元素名称\`

命名要求：
- 命名必须清晰、唯一，后续问题清单中对组件的指代必须与此处命名完全一致
- 示例：
\`\`\`
## ▌右下 · 奖励区域
### └ 奖励标题
### └ 奖励列表
- ◦ 奖励项（默认态）
  - · 奖励图标
  - · 奖励名称
  - · 奖励数量
\`\`\`

## 问题清单

按组件归组，组件名称与组件树保持一致，每个组件下按 P1→P8 优先级排列问题。
**每条问题单独占一行，条目之间必须有空行分隔，严禁多条连写。**

格式示例：

### [组件名称 · 状态]

🔴 高 ｜ P1 位置 ｜ 问题描述

🟡 中 ｜ P3 间距 ｜ 问题描述

🟢 低 ｜ P5 色彩 ｜ 问题描述

## 还原度评分

| 优先级 | 维度 | 得分 | 主要扣分原因 |
|--------|------|------|-------------|
| P1 | 位置 | /10 | |
| P2 | 大小（含字号） | /10 | |
| P3 | 间距 | /10 | |
| P4 | 字体样式 | /10 | |
| P5 | 色彩精确度 | /10 | |
| P6 | 图标素材 | /10 | |
| P7 | 背景与可读性 | /10 | |
| P8 | 视觉层级 | /10 | |
| — | **综合还原度** | **/100** | |`
}

/**
 * 从浏览器直接调用 Claude API 对比两张图片
 * @param {File} artFile - 美术效果图
 * @param {File} gameFile - 游戏实机截图
 * @param {object} options
 * @param {function} [onProgress] - 进度回调 (phase) => void
 * @returns {Promise<string>} 分析报告文本
 */
export async function compareImages(artFile, gameFile, {
  apiKey,
  baseUrl = '',
  thinkingBudget = 0.18,
  canvasWidth = 1920,
  canvasHeight = 1080,
  artDimensions = null,
  gameDimensions = null,
  onProgress = () => {},
} = {}) {

  // ── 阶段 1：图片预处理 ──
  onProgress(PHASES.PREPROCESSING)

  // 图片大小校验（单张 > 20MB 警告）
  const MAX_FILE_SIZE = 20 * 1024 * 1024
  if (artFile.size > MAX_FILE_SIZE || gameFile.size > MAX_FILE_SIZE) {
    throw new AnalyzeError(ERROR_TYPES.IMAGE, '图片文件过大', {
      detail: `设计稿 ${(artFile.size / 1024 / 1024).toFixed(1)}MB，截图 ${(gameFile.size / 1024 / 1024).toFixed(1)}MB`,
      suggestions: [
        '单张图片建议不超过 20MB',
        '可先压缩图片再上传',
        'PNG 截图可转为 JPEG 减小体积',
      ],
    })
  }

  let img1Base64, img2Base64, img1Type, img2Type, colors1, colors2
  try {
    ;[img1Base64, img2Base64, img1Type, img2Type, colors1, colors2] = await Promise.all([
      imageToBase64(artFile),
      imageToBase64(gameFile),
      Promise.resolve(getMediaType(artFile)),
      Promise.resolve(getMediaType(gameFile)),
      extractDominantColors(artFile),
      extractDominantColors(gameFile),
    ])
  } catch (err) {
    throw new AnalyzeError(ERROR_TYPES.IMAGE, '图片预处理失败', {
      detail: err.message,
      suggestions: [
        '确认上传的文件是有效的图片格式（PNG/JPG/WebP）',
        '尝试重新截图或用其他格式',
      ],
    })
  }

  const budgetTokens = Math.max(1024, Math.min(dollarsToTokens(thinkingBudget), MODEL_MAX_TOKENS - 8192))
  const prompt = buildPrompt(colors1, colors2, canvasWidth, canvasHeight, artDimensions, gameDimensions)

  const requestBody = {
    model: MODEL,
    max_tokens: MODEL_MAX_TOKENS,
    thinking: {
      type: 'enabled',
      budget_tokens: budgetTokens,
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: img1Type, data: img1Base64 } },
          { type: 'image', source: { type: 'base64', media_type: img2Type, data: img2Base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  }

  const apiUrl = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = `${apiUrl}/v1/messages`

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }

  // ── 阶段 2：发送请求 ──
  onProgress(PHASES.REQUESTING)

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })
  } catch (err) {
    // fetch 抛错 = 网络不通 / CORS 拦截
    const isCors = err.message?.includes('Failed to fetch') || err.name === 'TypeError'
    throw new AnalyzeError(
      isCors ? ERROR_TYPES.CORS : ERROR_TYPES.NETWORK,
      isCors ? '跨域请求被浏览器拦截 (CORS)' : '网络连接失败',
      {
        detail: `${apiUrl}\n${err.message}`,
        suggestions: isCors
          ? [
              '你的服务商 URL 需要支持浏览器跨域访问',
              '联系服务商后端开启 CORS 响应头（Access-Control-Allow-Origin）',
              '或使用支持 CORS 的代理地址',
            ]
          : [
              '检查网络是否正常',
              '确认服务商 URL 是否可访问',
              '如果在公司内网，确认 VPN 是否连接',
            ],
        retryable: !isCors,
      }
    )
  }

  // ── 阶段 3：等待 AI 分析 ──
  onProgress(PHASES.WAITING)

  // 处理第一次请求的错误
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    const errMsg = errData?.error?.message || ''

    // thinking 不支持 → 回退普通模式
    if (errMsg.toLowerCase().includes('think') || response.status === 400) {
      onProgress(PHASES.REQUESTING) // 重新标记为发送中

      const fallbackBody = { ...requestBody }
      delete fallbackBody.thinking
      fallbackBody.max_tokens = Math.min(MODEL_MAX_TOKENS, 8192)

      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(fallbackBody),
        })
      } catch (err) {
        throw new AnalyzeError(ERROR_TYPES.NETWORK, '回退请求失败', {
          detail: err.message,
          suggestions: ['网络可能不稳定，请重试'],
          retryable: true,
        })
      }

      onProgress(PHASES.WAITING)

      if (!response.ok) {
        const retryErrData = await response.json().catch(() => ({}))
        throw classifyApiError(response.status, retryErrData)
      }
    } else {
      throw classifyApiError(response.status, errData)
    }
  }

  // ── 阶段 4：解析结果 ──
  onProgress(PHASES.PARSING)

  let data
  try {
    data = await response.json()
  } catch (err) {
    throw new AnalyzeError(ERROR_TYPES.PARSE, '响应数据解析失败', {
      detail: err.message,
      suggestions: ['API 返回了非标准格式，可能是服务商代理的问题', '请重试或联系服务商'],
      retryable: true,
    })
  }

  // 提取文本内容（跳过 thinking block）
  for (const block of (data.content || [])) {
    if (block.type === 'text') {
      return block.text
    }
  }

  throw new AnalyzeError(ERROR_TYPES.PARSE, 'AI 返回了空结果', {
    detail: JSON.stringify(data.content?.map(b => b.type) || []),
    suggestions: ['模型可能只输出了 thinking 内容而没有正文', '请重试'],
    retryable: true,
  })
}
