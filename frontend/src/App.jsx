/**
 * [WHO]: 提供 App 默认导出组件及全部子组件（状态条、进度面板、错误面板、图片上传、结果展示、历史记录）
 * [FROM]: 依赖 react, react-markdown, lucide-react, analyzer.js 及 App.css
 * [TO]: 被 main.jsx 挂载为根组件；纯前端直接调用 Claude API
 * [HERE]: frontend/src/App.jsx — React SPA 主组件；支持 hash 路由 (#/task/:id) + localStorage 历史
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Eye, EyeOff, ChevronDown, Copy, RotateCcw,
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, X, Plus,
  Wifi, WifiOff, Key, Clock, Shield, Server, Zap, ImageIcon, Info,
  History, Trash2, ArrowLeft, FileText
} from 'lucide-react'
import { compareImages, AnalyzeError, ERROR_TYPES, PHASES } from './analyzer.js'
import { saveImages, loadImages, deleteImages } from './imageStore.js'
import './App.css'

/* ─── 工具 ─── */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

/* ─── 计时 Hook ─── */
function useElapsedTime(running) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(null)

  useEffect(() => {
    if (running) {
      startRef.current = Date.now()
      setElapsed(0)
      const timer = setInterval(() => {
        setElapsed(Date.now() - startRef.current)
      }, 200)
      return () => clearInterval(timer)
    }
  }, [running])

  return elapsed
}

/* ─── Hash 路由 ─── */
function generateTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function getTaskIdFromHash() {
  const match = window.location.hash.match(/^#\/task\/(.+)$/)
  return match ? match[1] : null
}

function setHashRoute(taskId) {
  window.location.hash = taskId ? `/task/${taskId}` : ''
}

/* ─── localStorage 历史 ─── */
const STORAGE_KEY = 'visual-diff-history'
const MAX_HISTORY = 50
const THUMB_SIZE = 80

/** 将 File 压缩为 base64 缩略图 */
async function fileToThumbnail(file) {
  if (!file) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(THUMB_SIZE / img.width, THUMB_SIZE / img.height, 1)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.6))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => resolve(null)
    img.src = URL.createObjectURL(file)
  })
}

/** 将 File 压缩为可查看的预览图（宽度限 1600px，JPEG 质量 0.85，存入 IndexedDB） */
const PREVIEW_MAX_WIDTH = 1600
async function fileToPreview(file) {
  if (!file) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(PREVIEW_MAX_WIDTH / img.width, 1)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => resolve(null)
    img.src = URL.createObjectURL(file)
  })
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveHistory(records) {
  const data = records.slice(0, MAX_HISTORY)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    // localStorage 满了，逐条删旧记录直到能存下
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      for (let i = data.length - 1; i > 0; i--) {
        const trimmed = data.slice(0, i)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
          return
        } catch { /* continue trimming */ }
      }
    }
  }
}

function countSeverity(text) {
  const counts = { '🔴': 0, '🟡': 0, '🟢': 0 }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t.startsWith('🔴')) counts['🔴']++
    else if (t.startsWith('🟡')) counts['🟡']++
    else if (t.startsWith('🟢')) counts['🟢']++
  }
  return counts
}

/* ─── 错误类型配置 ─── */
const ERROR_META = {
  [ERROR_TYPES.CORS]:       { icon: Shield, title: '跨域访问被拦截',   color: '#e67e22' },
  [ERROR_TYPES.NETWORK]:    { icon: WifiOff, title: '网络连接失败',    color: '#e74c3c' },
  [ERROR_TYPES.AUTH]:        { icon: Key, title: 'API Key 认证失败',    color: '#e74c3c' },
  [ERROR_TYPES.RATE_LIMIT]:  { icon: Clock, title: '请求被限流',       color: '#f39c12' },
  [ERROR_TYPES.MODEL]:       { icon: Server, title: '模型不可用',      color: '#9b59b6' },
  [ERROR_TYPES.OVERLOADED]:  { icon: Zap, title: 'API 服务过载',      color: '#e67e22' },
  [ERROR_TYPES.SERVER]:      { icon: Server, title: '服务端错误',      color: '#e74c3c' },
  [ERROR_TYPES.IMAGE]:       { icon: ImageIcon, title: '图片处理异常', color: '#e67e22' },
  [ERROR_TYPES.PARSE]:       { icon: Info, title: '结果解析异常',      color: '#e67e22' },
  [ERROR_TYPES.UNKNOWN]:     { icon: AlertCircle, title: '未知错误',   color: '#e74c3c' },
}

const SEVERITY_CONFIG = {
  '🔴': { label: '高', color: '#dc3545', bg: '#dc35450f', icon: AlertCircle },
  '🟡': { label: '中', color: '#c58c00', bg: '#c58c000f', icon: AlertTriangle },
  '🟢': { label: '低', color: '#198754', bg: '#1987540f', icon: CheckCircle2 },
}

/* ─── 状态条 ─── */
function StatusBar({ apiKey, artImage, gameImage, loading, phase, elapsed, error, result }) {
  let type, icon, text

  if (error) {
    const meta = error instanceof AnalyzeError ? ERROR_META[error.type] : ERROR_META[ERROR_TYPES.UNKNOWN]
    type = 'error'
    icon = <meta.icon size={14} />
    text = meta.title
  } else if (loading) {
    type = 'loading'
    icon = <Loader2 size={14} className="spin" />
    const phaseLabel = phase ? `${phase.icon} ${phase.label}` : '准备中'
    text = `${phaseLabel}  ·  ${formatElapsed(elapsed)}`
  } else if (result) {
    type = 'success'
    icon = <CheckCircle2 size={14} />
    text = `分析完成  ·  耗时 ${formatElapsed(elapsed)}`
  } else {
    const missing = []
    if (!apiKey.trim()) missing.push('API Key')
    if (!artImage) missing.push('设计稿')
    if (!gameImage) missing.push('实机截图')
    if (missing.length > 0) {
      type = 'warn'
      icon = <Info size={14} />
      text = `请填写：${missing.join('、')}`
    } else {
      type = 'ready'
      icon = <CheckCircle2 size={14} />
      text = '就绪，可以开始分析'
    }
  }

  return (
    <div className={`status-bar status-${type}`}>
      {icon}
      <span className="status-text">{text}</span>
      {loading && phase && (
        <span className="status-steps">
          步骤 {phase.step}/{phase.total}
        </span>
      )}
    </div>
  )
}

/* ─── 进度面板 ─── */
function ProgressPanel({ phase, elapsed }) {
  if (!phase) return null
  const allPhases = [PHASES.PREPROCESSING, PHASES.REQUESTING, PHASES.WAITING, PHASES.PARSING]

  return (
    <div className="progress-panel">
      <div className="progress-steps">
        {allPhases.map((p, i) => {
          const isCurrent = p.key === phase.key
          const isDone = p.step < phase.step
          return (
            <div key={p.key} className={`progress-step ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}>
              <div className="step-dot">
                {isDone ? <CheckCircle2 size={14} /> : isCurrent ? <Loader2 size={14} className="spin" /> : <span className="step-num">{p.step}</span>}
              </div>
              <span className="step-label">{p.label}</span>
              {i < allPhases.length - 1 && <div className={`step-line ${isDone ? 'done' : ''}`} />}
            </div>
          )
        })}
      </div>
      {phase.key === 'waiting' && (
        <div className="progress-hint">
          ⏳ AI 深度分析中，通常需要 30-120 秒，请耐心等待…
        </div>
      )}
      <div className="progress-timer">
        <Clock size={13} /> {formatElapsed(elapsed)}
      </div>
    </div>
  )
}

/* ─── 错误面板 ─── */
function ErrorPanel({ error, onDismiss, onRetry }) {
  if (!error) return null

  const isStructured = error instanceof AnalyzeError
  const meta = isStructured ? ERROR_META[error.type] : ERROR_META[ERROR_TYPES.UNKNOWN]
  const Icon = meta.icon
  const suggestions = isStructured ? error.suggestions : []
  const detail = isStructured ? error.detail : ''
  const retryable = isStructured ? error.retryable : true
  const [showDetail, setShowDetail] = useState(false)

  const copyError = () => {
    const text = [
      `错误类型: ${isStructured ? error.type : 'unknown'}`,
      `信息: ${error.message}`,
      detail ? `详情: ${detail}` : '',
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="error-panel" style={{ '--error-color': meta.color }}>
      <div className="error-header">
        <div className="error-title-row">
          <Icon size={16} style={{ color: meta.color }} />
          <strong className="error-title">{meta.title}</strong>
        </div>
        <button className="error-dismiss" onClick={onDismiss} title="关闭">
          <X size={14} />
        </button>
      </div>
      <p className="error-message">{error.message}</p>

      {suggestions.length > 0 && (
        <div className="error-suggestions">
          <span className="suggestions-label">排查建议：</span>
          <ul>
            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <div className="error-actions">
        {retryable && (
          <button className="error-action-btn retry" onClick={onRetry}>
            <RotateCcw size={13} /> 重试
          </button>
        )}
        <button className="error-action-btn copy" onClick={copyError}>
          <Copy size={13} /> 复制错误信息
        </button>
        {detail && (
          <button className="error-action-btn detail" onClick={() => setShowDetail(!showDetail)}>
            {showDetail ? '收起详情' : '展开详情'}
          </button>
        )}
      </div>

      {showDetail && detail && (
        <pre className="error-detail">{detail}</pre>
      )}
    </div>
  )
}

/* ─── 图片上传区 ─── */
function ImageDropZone({ label, sublabel, image, onImageChange }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onImageChange(file)
  }, [onImageChange])

  const handlePaste = useCallback((e) => {
    const items = [...(e.clipboardData?.items || [])]
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (imgItem) {
      e.preventDefault()
      onImageChange(imgItem.getAsFile())
    }
  }, [onImageChange])

  useEffect(() => {
    const el = inputRef.current?.closest('.drop-zone')
    if (!el) return
    const handler = (e) => handlePaste(e)
    el.addEventListener('paste', handler)
    return () => el.removeEventListener('paste', handler)
  }, [handlePaste])

  const preview = image ? URL.createObjectURL(image) : null

  return (
    <div
      className={`drop-zone ${dragOver ? 'drag-over' : ''} ${image ? 'has-image' : ''}`}
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onImageChange(e.target.files[0])}
      />
      {preview ? (
        <div className="preview-wrapper">
          <img src={preview} alt={label} className="preview-image" />
          <div className="preview-bar">
            <span className="preview-label">{label}</span>
            <span className="preview-size">{formatBytes(image.size)}</span>
            <button
              className="remove-btn"
              onClick={(e) => { e.stopPropagation(); onImageChange(null) }}
              title="移除图片"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="drop-placeholder">
          <Plus size={24} strokeWidth={1.5} />
          <span className="drop-label">{label}</span>
          <span className="drop-sublabel">{sublabel}</span>
          <span className="drop-hint">拖放、粘贴或点击上传</span>
        </div>
      )}
    </div>
  )
}

/* ─── 严重程度筛选 ─── */
function SeverityFilter({ filters, onChange }) {
  return (
    <div className="severity-filters">
      {Object.entries(SEVERITY_CONFIG).map(([emoji, cfg]) => {
        const active = filters.includes(emoji)
        const Icon = cfg.icon
        return (
          <button
            key={emoji}
            className={`severity-chip ${active ? 'active' : ''}`}
            style={{ '--chip-color': cfg.color, '--chip-bg': active ? cfg.bg : 'transparent' }}
            onClick={() => onChange(active ? filters.filter(f => f !== emoji) : [...filters, emoji])}
          >
            <Icon size={13} /> {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── 分析结果（通用 H2 分段渲染） ─── */
function splitByH2(text) {
  const sections = []
  const lines = text.split('\n')
  let current = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { title: line.replace(/^## /, '').trim(), lines: [] }
    } else {
      if (current) {
        current.lines.push(line)
      } else if (line.trim()) {
        current = { title: '', lines: [line] }
      }
    }
  }
  if (current) sections.push(current)
  return sections.map(s => ({ title: s.title, content: s.lines.join('\n').trim() }))
}

function filterBySeverity(content, filters) {
  if (filters.length === 3) return content
  const lines = content.split('\n')
  const result = []
  let skip = false
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('🔴') || t.startsWith('🟡') || t.startsWith('🟢')) {
      skip = !filters.some(f => t.startsWith(f))
      if (!skip) result.push(line)
    } else {
      if (!skip) result.push(line)
    }
  }
  return result.join('\n')
}

function AnalysisResult({ text, filters, onFiltersChange }) {
  if (!text) return null
  const sections = splitByH2(text)

  if (sections.length === 0) {
    return (
      <div className="analysis-result">
        <div className="result-section">
          <div className="markdown-content">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  const isIssueSection = (s) =>
    s.content.includes('🔴') || s.content.includes('🟡') || s.content.includes('🟢')

  // 识别组件树区域
  const treeStartIdx = sections.findIndex(s => s.title.includes('组件树'))
  const treeEndIdx = sections.findIndex((s, i) =>
    i > treeStartIdx && (s.title.includes('问题清单') || s.title.includes('评分'))
  )
  const treeSections = treeStartIdx >= 0
    ? sections.slice(treeStartIdx, treeEndIdx >= 0 ? treeEndIdx : undefined)
        .filter(s => !isIssueSection(s))
    : []
  const treeSectionSet = new Set(treeSections)

  // 组件树子区块（去掉总标题 "组件树"）
  const treeOverview = treeSections.find(s => s.title.includes('组件树'))
  const treeBlocks = treeSections.filter(s => s !== treeOverview)

  // 找到问题清单 section，按 ### 拆成子组
  const issueSection = sections.find(s => s.title.includes('问题清单'))
  const issueGroups = issueSection ? splitByH3(issueSection.content) : []

  // 其他 section（评分等）
  const otherSections = sections.filter(s => !treeSectionSet.has(s) && s !== issueSection)

  // 将每个树区块与问题组配对
  // 归一化函数：去掉 ▌·[]空格 等干扰字符，统一比较
  const normalize = s => s.replace(/[▌·\[\]【】\s]/g, '').toLowerCase()

  const paired = treeBlocks.map(block => {
    const blockName = block.title.replace(/^[▌·\s]+/, '').replace(/[·\s]+$/, '').trim()
    const normBlock = normalize(blockName)
    // 也提取树区块下的子组件名（### └ xxx 或 - ◦ xxx），用于子组件级匹配
    const subNames = []
    for (const line of block.content.split('\n')) {
      const subM = line.match(/(?:###\s*└\s*|[-*]\s*◦\s*)(.+?)(?:\s*[\(（].*)?$/)
      if (subM) subNames.push(normalize(subM[1].trim()))
    }

    const matchedGroups = []
    for (const group of issueGroups) {
      if (group._matched) continue
      const normHeading = normalize(group.heading)
      // 双向模糊匹配：区块名 ⊂ 问题标题 OR 问题标题核心 ⊂ 区块名
      const headingCore = normHeading.replace(/默认态|激活态|悬停态|禁用态|选中态/g, '')
      if (normBlock && (normHeading.includes(normBlock) || headingCore.includes(normBlock) || normBlock.includes(headingCore))) {
        group._matched = true
        matchedGroups.push(group)
        continue
      }
      // 子组件匹配
      if (subNames.some(sub => normHeading.includes(sub) || sub.includes(headingCore))) {
        group._matched = true
        matchedGroups.push(group)
      }
    }
    return { block, issues: matchedGroups }
  })

  // 未匹配的问题组
  const unmatchedIssues = issueGroups.filter(g => !g._matched)

  return (
    <div className="analysis-paired">
      {/* 总览行：组件树概览（如果有） */}
      {treeOverview && treeOverview.content.trim() && (
        <div className="paired-overview result-section tree-section">
          <h3 className="section-title">{treeOverview.title}</h3>
          <div className="markdown-content">
            <ReactMarkdown>{treeOverview.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 筛选条 */}
      {issueSection && onFiltersChange && (
        <div className="paired-filters">
          <span className="paired-filters-label">按优先级筛选问题</span>
          <SeverityFilter filters={filters} onChange={onFiltersChange} />
        </div>
      )}

      {/* 逐区块对照 */}
      {paired.map(({ block, issues }, idx) => {
        const hasIssues = issues.length > 0
        const issueContent = hasIssues
          ? issues.map(g => `### ${g.heading}\n${g.content}`).join('\n\n')
          : ''
        const filteredContent = hasIssues ? filterBySeverity(issueContent, filters) : ''
        // 过滤后是否还有可见问题
        const filteredHasContent = filteredContent.trim().split('\n').some(l => {
          const t = l.trim()
          return t.startsWith('🔴') || t.startsWith('🟡') || t.startsWith('🟢')
        })

        return (
          <div key={idx} className="paired-row">
            <div className="paired-left result-section tree-section">
              <h3 className="section-title">{block.title}</h3>
              <div className="markdown-content">
                <ReactMarkdown>{block.content}</ReactMarkdown>
              </div>
            </div>
            <div className={`paired-right result-section ${hasIssues ? 'issues-section' : 'empty-section'}`}>
              {hasIssues ? (
                filteredHasContent ? (
                  <div className="markdown-content issues-content">
                    <ReactMarkdown>{filteredContent}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-icon">🎯</span>
                    <span className="empty-text">当前筛选条件下无问题</span>
                  </div>
                )
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">✨</span>
                  <span className="empty-text">真棒，此区域无问题！</span>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* 未配对的问题（兜底） */}
      {unmatchedIssues.length > 0 && (
        <div className="paired-row">
          <div className="paired-left result-section tree-section">
            <h3 className="section-title">其他</h3>
          </div>
          <div className="paired-right result-section issues-section">
            <div className="markdown-content issues-content">
              <ReactMarkdown>{filterBySeverity(
                unmatchedIssues.map(g => `### ${g.heading}\n${g.content}`).join('\n\n'),
                filters
              )}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* 评分等其他 section */}
      {otherSections.map((section, idx) => {
        const isScore = section.title.toLowerCase().includes('评分')
        return (
          <div key={`other-${idx}`} className={`result-section paired-full ${isScore ? 'score-section' : ''}`}>
            {section.title && <h3 className="section-title">{section.title}</h3>}
            {isScore ? (
              <ScoreCard content={section.content} />
            ) : (
              <div className="markdown-content">
                <ReactMarkdown>{section.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 解析评分表格文本为结构化数据 */
function parseScoreTable(content) {
  const rows = []
  let totalScore = null
  let totalReason = ''
  for (const line of content.split('\n')) {
    // 匹配表格行：| P1 | 位置 | 8/10 | 原因 |
    const m = line.match(/\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\|\s*(.*?)\s*\|/)
    if (m) {
      rows.push({ priority: m[1], dimension: m[2].trim(), score: parseInt(m[3]), total: parseInt(m[4]), reason: m[5].trim() })
    }
    // 匹配综合得分行：| — | **综合还原度** | **85/100** |
    const totalMatch = line.match(/综合还原度.*?\*?\*?(\d+)\s*\/\s*(\d+)\*?\*?/)
    if (totalMatch) {
      totalScore = { score: parseInt(totalMatch[1]), total: parseInt(totalMatch[2]) }
      const reasonM = line.match(/\|\s*([^|]*?)\s*\|?\s*$/)
      if (reasonM) totalReason = reasonM[1].replace(/\*+/g, '').trim()
    }
  }
  return { rows, totalScore, totalReason }
}

function ScoreCard({ content }) {
  const { rows, totalScore } = parseScoreTable(content)

  if (rows.length === 0 && !totalScore) {
    return (
      <div className="markdown-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    )
  }

  // 提取表格前后的文字内容（总结、说明等）
  const lines = content.split('\n')
  const tableStartIdx = lines.findIndex(l => l.trim().startsWith('|'))
  const tableEndIdx = (() => {
    let last = -1
    lines.forEach((l, i) => { if (l.trim().startsWith('|')) last = i })
    return last
  })()
  const beforeTable = tableStartIdx > 0 ? lines.slice(0, tableStartIdx).join('\n').trim() : ''
  const afterTable = tableEndIdx >= 0 && tableEndIdx < lines.length - 1
    ? lines.slice(tableEndIdx + 1).join('\n').trim() : ''

  const overallPct = totalScore ? Math.round(totalScore.score / totalScore.total * 100) : null
  const overallColor = overallPct >= 80 ? 'var(--mint)' : overallPct >= 60 ? 'var(--amber)' : 'var(--red)'

  return (
    <div className="score-visual">
      {/* 表格前的文字 */}
      {beforeTable && (
        <div className="score-pretext markdown-content">
          <ReactMarkdown>{beforeTable}</ReactMarkdown>
        </div>
      )}

      {/* 综合得分 */}
      {totalScore && (
        <div className="score-hero">
          <div className="score-ring" style={{ '--pct': overallPct, '--ring-color': overallColor }}>
            <svg viewBox="0 0 100 100" className="score-ring-svg">
              <circle cx="50" cy="50" r="42" className="ring-bg" />
              <circle cx="50" cy="50" r="42" className="ring-fill" strokeDasharray={`${overallPct * 2.64} 264`} />
            </svg>
            <div className="score-ring-value">
              <span className="score-number">{totalScore.score}</span>
              <span className="score-total">/{totalScore.total}</span>
            </div>
          </div>
          <div className="score-hero-label">综合还原度</div>
        </div>
      )}

      {/* 分项评分 — 每项一行 */}
      <div className="score-items">
        {rows.map((row, i) => {
          const pct = Math.round(row.score / row.total * 100)
          const color = pct >= 80 ? 'var(--mint)' : pct >= 60 ? 'var(--amber)' : 'var(--red)'
          return (
            <div key={i} className="score-item">
              <div className="score-item-header">
                <span className="score-item-priority">{row.priority}</span>
                <span className="score-item-dim">{row.dimension}</span>
                <span className="score-item-value" style={{ color }}>{row.score}<small>/{row.total}</small></span>
              </div>
              <div className="score-bar-track">
                <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
              {row.reason && <p className="score-item-reason">{row.reason}</p>}
            </div>
          )
        })}
      </div>

      {/* 表格后的文字（总结等） */}
      {afterTable && (
        <div className="score-posttext markdown-content">
          <ReactMarkdown>{afterTable}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
function splitByH3(text) {
  const groups = []
  const lines = text.split('\n')
  let current = null
  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (current) groups.push(current)
      current = { heading: line.replace(/^### /, '').trim(), content: '', _matched: false }
    } else if (current) {
      current.content += line + '\n'
    }
  }
  if (current) groups.push(current)
  // trim content
  groups.forEach(g => { g.content = g.content.trim() })
  return groups
}

/* ─── 历史图片预览（从 IndexedDB 加载高清图） ─── */
function HistoryImagePreview({ taskId }) {
  const [images, setImages] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!taskId) { setImages(null); setLoading(false); return }
    setLoading(true)
    loadImages(taskId).then((data) => {
      setImages(data)
      setLoading(false)
    })
  }, [taskId])

  if (loading) {
    return (
      <div className="history-images history-images-loading">
        <Loader2 size={16} className="spin" />
        <span>加载图片中…</span>
      </div>
    )
  }

  if (!images) return null
  const { artPreview, gamePreview } = images
  if (!artPreview && !gamePreview) return null

  return (
    <div className="history-images">
      {artPreview && (
        <div className="history-image-card">
          <span className="history-image-label">🎨 设计稿</span>
          <img src={artPreview} alt="设计稿" className="history-image" />
        </div>
      )}
      {gamePreview && (
        <div className="history-image-card">
          <span className="history-image-label">🖥️ 实机截图</span>
          <img src={gamePreview} alt="实机截图" className="history-image" />
        </div>
      )}
    </div>
  )
}

/* ─── 历史列表 ─── */
function HistoryPanel({ history, onSelect, onDelete, currentTaskId }) {
  if (history.length === 0) return null

  return (
    <div className="history-panel">
      <div className="history-header">
        <History size={14} />
        <span className="history-title">历史记录</span>
        <span className="history-count">{history.length}</span>
      </div>
      <div className="history-list">
        {history.map((record) => {
          const severity = countSeverity(record.result)
          const isActive = record.id === currentTaskId
          return (
            <div
              key={record.id}
              className={`history-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(record.id)}
            >
              <div className="history-thumbs">
                {record.artThumb && <img src={record.artThumb} alt="" className="history-thumb" />}
                {record.gameThumb && <img src={record.gameThumb} alt="" className="history-thumb" />}
                {!record.artThumb && !record.gameThumb && <FileText size={20} className="history-thumb-placeholder" />}
              </div>
              <div className="history-info">
                <span className="history-time">
                  {new Date(record.timestamp).toLocaleString('zh-CN', {
                    month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <span className="history-badges">
                  {severity['🔴'] > 0 && <span className="badge badge-red">{severity['🔴']}</span>}
                  {severity['🟡'] > 0 && <span className="badge badge-yellow">{severity['🟡']}</span>}
                  {severity['🟢'] > 0 && <span className="badge badge-green">{severity['🟢']}</span>}
                </span>
              </div>
              <button
                className="history-delete"
                title="删除"
                onClick={(e) => { e.stopPropagation(); onDelete(record.id) }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── 主应用 ─── */
export default function App() {
  const [apiKey, setApiKeyRaw] = useState(() => localStorage.getItem('visual-diff-apikey') || '')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrlRaw] = useState(() => localStorage.getItem('visual-diff-baseurl') || 'https://ai.leihuo.netease.com/')

  const setApiKey = useCallback((v) => { setApiKeyRaw(v); localStorage.setItem('visual-diff-apikey', v) }, [])
  const setBaseUrl = useCallback((v) => { setBaseUrlRaw(v); localStorage.setItem('visual-diff-baseurl', v) }, [])
  const [thinkingBudget, setThinkingBudget] = useState(0.18)
  const [canvasW, setCanvasW] = useState(2100)
  const [canvasH, setCanvasH] = useState(1080)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [artImage, setArtImage] = useState(null)
  const [gameImage, setGameImage] = useState(null)

  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState(['🔴', '🟡', '🟢'])

  // 历史 & 路由
  const [history, setHistory] = useState(() => loadHistory())
  const [viewingTaskId, setViewingTaskId] = useState(null)
  const [viewingResult, setViewingResult] = useState('')

  const elapsed = useElapsedTime(loading)
  const canAnalyze = apiKey.trim() && artImage && gameImage && !loading

  // 启动时检查 hash，加载对应历史任务
  useEffect(() => {
    const taskId = getTaskIdFromHash()
    if (taskId) {
      const record = loadHistory().find(r => r.id === taskId)
      if (record) {
        setViewingTaskId(taskId)
        setViewingResult(record.result)
      }
    }

    const onHashChange = () => {
      const id = getTaskIdFromHash()
      if (id) {
        const record = loadHistory().find(r => r.id === id)
        if (record) {
          setViewingTaskId(id)
          setViewingResult(record.result)
          return
        }
      }
      setViewingTaskId(null)
      setViewingResult('')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 选择历史记录
  const handleSelectHistory = useCallback((taskId) => {
    const record = history.find(r => r.id === taskId)
    if (record) {
      setViewingTaskId(taskId)
      setViewingResult(record.result)
      setResult('')
      setError(null)
      setHashRoute(taskId)
    }
  }, [history])

  // 删除历史记录
  const handleDeleteHistory = useCallback((taskId) => {
    const updated = history.filter(r => r.id !== taskId)
    setHistory(updated)
    saveHistory(updated)
    deleteImages(taskId) // 清理 IndexedDB 大图
    if (viewingTaskId === taskId) {
      setViewingTaskId(null)
      setViewingResult('')
      setHashRoute(null)
    }
  }, [history, viewingTaskId])

  // 返回首页
  const handleBackToHome = useCallback(() => {
    setViewingTaskId(null)
    setViewingResult('')
    setHashRoute(null)
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!apiKey.trim() || !artImage || !gameImage || loading) return
    setLoading(true)
    setPhase(null)
    setError(null)
    setResult('')
    setViewingTaskId(null)
    setViewingResult('')

    try {
      const text = await compareImages(artImage, gameImage, {
        apiKey: apiKey.trim(),
        baseUrl,
        thinkingBudget,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        onProgress: setPhase,
      })
      setResult(text)

      // 保存到历史
      const taskId = generateTaskId()
      const [artThumb, gameThumb, artPreview, gamePreview] = await Promise.all([
        fileToThumbnail(artImage),
        fileToThumbnail(gameImage),
        fileToPreview(artImage),
        fileToPreview(gameImage),
      ])

      // 大图存 IndexedDB（不占 localStorage 配额）
      await saveImages(taskId, { artPreview, gamePreview })

      // 元数据+缩略图存 localStorage
      const record = {
        id: taskId,
        timestamp: Date.now(),
        result: text,
        artThumb,
        gameThumb,
      }
      const updated = [record, ...history]
      setHistory(updated)
      saveHistory(updated)
      setHashRoute(taskId)
      setViewingTaskId(taskId)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [apiKey, artImage, gameImage, loading, baseUrl, thinkingBudget, canvasW, canvasH, history])

  // 当前要展示的结果文本（新分析 or 历史查看）
  const displayResult = viewingResult || result

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          {viewingTaskId && !result && (
            <button className="back-btn" onClick={handleBackToHome} title="返回">
              <ArrowLeft size={16} />
            </button>
          )}
          <span className="header-emoji">🎮</span>
          <h1 className="app-title">Visual Diff</h1>
          <span className="app-divider" />
          <p className="app-subtitle">美术还原度小助手 · @xuqing1</p>
        </div>
        <StatusBar
          apiKey={apiKey}
          artImage={artImage}
          gameImage={gameImage}
          loading={loading}
          phase={phase}
          elapsed={elapsed}
          error={error}
          result={displayResult}
        />
      </header>

      <main className="main-content">
        {/* 历史查看模式：只显示结果 */}
        {viewingTaskId && viewingResult && !result ? (
          <div className="results-area">
            <div className="results-header">
              <div className="results-title-row">
                <button className="back-btn-inline" onClick={handleBackToHome}>
                  <ArrowLeft size={14} /> 返回
                </button>
                <h2 className="results-title">分析报告</h2>
                <span className="results-meta">
                  {(() => {
                    const record = history.find(r => r.id === viewingTaskId)
                    return record ? new Date(record.timestamp).toLocaleString('zh-CN') : ''
                  })()}
                </span>
              </div>
            </div>

            {/* 历史图片预览 — 从 IndexedDB 异步加载 */}
            <HistoryImagePreview taskId={viewingTaskId} />

            <AnalysisResult text={viewingResult} filters={filters} onFiltersChange={setFilters} />
          </div>
        ) : (
          <>
            {/* Config */}
            <div className="config-bar">
              <div className="config-fields">
                <div className="field key-field-group">
                  <label className="field-label">API Key</label>
                  <div className="input-with-action">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="input"
                    />
                    <button className="input-action" onClick={() => setShowKey(!showKey)} title={showKey ? '隐藏' : '显示'}>
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="field url-field-group">
                  <label className="field-label">服务商 URL</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="input"
                  />
                </div>
                <button
                  className={`toggle-more ${settingsOpen ? 'open' : ''}`}
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  title="更多设置"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {settingsOpen && (
                <div className="config-extra">
                  <div className="field">
                    <label className="field-label">Thinking 预算 ${thinkingBudget.toFixed(2)}</label>
                    <input
                      type="range" min="0.01" max="0.18" step="0.01"
                      value={thinkingBudget}
                      onChange={(e) => setThinkingBudget(parseFloat(e.target.value))}
                      className="range"
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">画布宽度</label>
                    <input type="number" value={canvasW} onChange={(e) => setCanvasW(parseInt(e.target.value) || 2100)} className="input input-narrow" />
                  </div>
                  <div className="field">
                    <label className="field-label">画布高度</label>
                    <input type="number" value={canvasH} onChange={(e) => setCanvasH(parseInt(e.target.value) || 1080)} className="input input-narrow" />
                  </div>
                </div>
              )}
            </div>

            {/* Upload */}
            <div className="upload-area">
              <ImageDropZone label="🎨 设计稿" sublabel="目标效果" image={artImage} onImageChange={setArtImage} />
              <div className="vs-badge">VS</div>
              <ImageDropZone label="🖥️ 实机截图" sublabel="实际还原" image={gameImage} onImageChange={setGameImage} />
            </div>

            {/* Action + Progress */}
            <div className="action-area">
              <button
                className={`analyze-btn ${loading ? 'is-loading' : ''}`}
                disabled={!canAnalyze}
                onClick={handleAnalyze}
              >
                {loading ? (
                  <><Loader2 size={16} className="spin" /> {phase?.label || '准备中'}…</>
                ) : (
                  <><Zap size={15} /> 开始分析 ✨</>
                )}
              </button>
            </div>

            {loading && <ProgressPanel phase={phase} elapsed={elapsed} />}

            {/* Error */}
            <ErrorPanel error={error} onDismiss={() => setError(null)} onRetry={handleAnalyze} />

            {/* 历史记录列表 */}
            <HistoryPanel
              history={history}
              onSelect={handleSelectHistory}
              onDelete={handleDeleteHistory}
              currentTaskId={viewingTaskId}
            />

            {/* Results（新分析结果） */}
            {result && (
              <div className="results-area">
                <div className="results-header">
                  <h2 className="results-title">分析报告</h2>
                </div>
                <AnalysisResult text={result} filters={filters} onFiltersChange={setFilters} />
              </div>
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>Made with 💜 · Powered by Claude · @xuqing1</span>
      </footer>
    </div>
  )
}
