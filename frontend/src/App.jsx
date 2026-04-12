/**
 * [WHO]: 提供 App 默认导出组件及全部子组件（状态条、进度面板、错误面板、图片上传、结果展示）
 * [FROM]: 依赖 react, react-markdown, lucide-react, analyzer.js 及 App.css
 * [TO]: 被 main.jsx 挂载为根组件；纯前端直接调用 Claude API
 * [HERE]: frontend/src/App.jsx — React SPA 主组件
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Eye, EyeOff, ChevronDown, Copy, RotateCcw,
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, X, Plus,
  Wifi, WifiOff, Key, Clock, Shield, Server, Zap, ImageIcon, Info
} from 'lucide-react'
import { compareImages, AnalyzeError, ERROR_TYPES, PHASES } from './analyzer.js'
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

/* ─── 分析结果 ─── */
function AnalysisResult({ text, filters }) {
  if (!text) return null
  const treeMatch = text.match(/(## 组件树.*?)(?=## 问题清单)/s)
  const analysisMatch = text.match(/(## 问题清单.*)/s)
  const tree = treeMatch ? treeMatch[1].trim() : ''
  const analysis = analysisMatch ? analysisMatch[1].trim() : text.trim()

  const filteredAnalysis = analysis.split('\n').filter(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('🔴') || trimmed.startsWith('🟡') || trimmed.startsWith('🟢')) {
      return filters.some(f => trimmed.startsWith(f))
    }
    return true
  }).join('\n')

  return (
    <div className="analysis-result">
      {tree && (
        <div className="result-section tree-section">
          <h3 className="section-title">组件树</h3>
          <div className="markdown-content tree-content">
            <ReactMarkdown>{tree.replace('## 组件树', '').trim()}</ReactMarkdown>
          </div>
        </div>
      )}
      <div className="result-section issues-section">
        <h3 className="section-title">问题清单</h3>
        <div className="markdown-content issues-content">
          <ReactMarkdown>{filteredAnalysis.replace('## 问题清单', '').trim()}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

/* ─── 主应用 ─── */
export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState('https://ai.leihuo.netease.com/')
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

  const elapsed = useElapsedTime(loading)
  const canAnalyze = apiKey.trim() && artImage && gameImage && !loading

  const handleAnalyze = useCallback(async () => {
    if (!apiKey.trim() || !artImage || !gameImage || loading) return
    setLoading(true)
    setPhase(null)
    setError(null)
    setResult('')

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
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [apiKey, artImage, gameImage, loading, baseUrl, thinkingBudget, canvasW, canvasH])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Visual Diff</h1>
          <span className="app-divider" />
          <p className="app-subtitle">游戏美术还原度检查</p>
        </div>
        <StatusBar
          apiKey={apiKey}
          artImage={artImage}
          gameImage={gameImage}
          loading={loading}
          phase={phase}
          elapsed={elapsed}
          error={error}
          result={result}
        />
      </header>

      <main className="main-content">
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
          <ImageDropZone label="设计稿" sublabel="目标效果" image={artImage} onImageChange={setArtImage} />
          <ImageDropZone label="实机截图" sublabel="实际还原" image={gameImage} onImageChange={setGameImage} />
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
              '开始分析'
            )}
          </button>
        </div>

        {loading && <ProgressPanel phase={phase} elapsed={elapsed} />}

        {/* Error */}
        <ErrorPanel error={error} onDismiss={() => setError(null)} onRetry={handleAnalyze} />

        {/* Results */}
        {result && (
          <div className="results-area">
            <div className="results-header">
              <h2 className="results-title">分析报告</h2>
              <SeverityFilter filters={filters} onChange={setFilters} />
            </div>
            <AnalysisResult text={result} filters={filters} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        Powered by Claude &middot; Visual Diff Tool
      </footer>
    </div>
  )
}
