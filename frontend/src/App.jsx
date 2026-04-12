import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Eye, EyeOff, Sparkles, Settings2, ChevronDown,
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, X, ImageIcon
} from 'lucide-react'
import './App.css'

const SEVERITY_CONFIG = {
  '🔴': { label: '高', color: '#ff4757', bg: 'rgba(255,71,87,0.1)', icon: AlertCircle },
  '🟡': { label: '中', color: '#ffa502', bg: 'rgba(255,165,2,0.1)', icon: AlertTriangle },
  '🟢': { label: '低', color: '#2ed573', bg: 'rgba(46,213,115,0.1)', icon: CheckCircle2 },
}

function ImageDropZone({ label, icon, image, onImageChange, accent }) {
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
    <motion.div
      className={`drop-zone ${dragOver ? 'drag-over' : ''} ${image ? 'has-image' : ''}`}
      style={{ '--accent': accent }}
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
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
          <div className="preview-overlay">
            <span className="preview-label">{icon} {label}</span>
            <button className="remove-btn" onClick={(e) => { e.stopPropagation(); onImageChange(null) }}>
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="drop-placeholder">
          <div className="drop-icon-ring">
            <ImageIcon size={32} strokeWidth={1.5} />
          </div>
          <span className="drop-label">{icon} {label}</span>
          <span className="drop-hint">拖放、粘贴或点击上传</span>
        </div>
      )}
    </motion.div>
  )
}

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
            style={{
              '--chip-color': cfg.color,
              '--chip-bg': active ? cfg.bg : 'transparent',
              borderColor: active ? cfg.color : 'rgba(255,255,255,0.1)',
            }}
            onClick={() => {
              onChange(active ? filters.filter(f => f !== emoji) : [...filters, emoji])
            }}
          >
            <Icon size={14} /> {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

function AnalysisResult({ text, filters }) {
  if (!text) return null

  // Split into component tree and issue list
  const treeMatch = text.match(/(## 组件树.*?)(?=## 问题清单)/s)
  const analysisMatch = text.match(/(## 问题清单.*)/s)
  const tree = treeMatch ? treeMatch[1].trim() : ''
  const analysis = analysisMatch ? analysisMatch[1].trim() : text.trim()

  // Filter by severity
  const filteredAnalysis = analysis.split('\n').filter(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('🔴') || trimmed.startsWith('🟡') || trimmed.startsWith('🟢')) {
      return filters.some(f => trimmed.startsWith(f))
    }
    return true
  }).join('\n')

  return (
    <motion.div
      className="analysis-result"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {tree && (
        <div className="result-section tree-section">
          <h3 className="section-title">🌳 组件树</h3>
          <div className="markdown-content tree-content">
            <ReactMarkdown>{tree.replace('## 组件树', '').trim()}</ReactMarkdown>
          </div>
        </div>
      )}
      <div className="result-section issues-section">
        <h3 className="section-title">📋 问题清单</h3>
        <div className="markdown-content issues-content">
          <ReactMarkdown>{filteredAnalysis.replace('## 问题清单', '').trim()}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  )
}

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
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(['🔴', '🟡', '🟢'])

  const canAnalyze = apiKey.trim() && artImage && gameImage && !loading

  const handleAnalyze = async () => {
    if (!canAnalyze) return
    setLoading(true)
    setError('')
    setResult('')

    const formData = new FormData()
    formData.append('art_image', artImage)
    formData.append('game_image', gameImage)
    formData.append('api_key', apiKey.trim())
    formData.append('base_url', baseUrl)
    formData.append('thinking_budget', thinkingBudget)
    formData.append('canvas_width', canvasW)
    formData.append('canvas_height', canvasH)

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `请求失败 (${res.status})`)
      }
      const data = await res.json()
      setResult(data.result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      {/* Ambient background */}
      <div className="ambient-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Header */}
      <header className="app-header">
        <motion.div
          className="logo-area"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="logo-icon">🎮</div>
          <div>
            <h1 className="app-title">Visual Diff</h1>
            <p className="app-subtitle">游戏美术效果对比工具</p>
          </div>
        </motion.div>
      </header>

      <main className="main-content">
        {/* API Key row */}
        <motion.div
          className="config-bar glass"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="key-input-group">
            <label className="input-label">API Key</label>
            <div className="key-field">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="text-input key-input"
              />
              <button className="icon-btn" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="url-input-group">
            <label className="input-label">服务商 URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="text-input"
            />
          </div>

          <button
            className={`settings-toggle ${settingsOpen ? 'open' : ''}`}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={16} />
            <ChevronDown size={14} className="chevron" />
          </button>
        </motion.div>

        {/* Advanced settings */}
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              className="settings-panel glass"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="settings-inner">
                <div className="setting-item">
                  <label className="input-label">Thinking 预算 (${thinkingBudget.toFixed(2)})</label>
                  <input
                    type="range"
                    min="0.01" max="0.18" step="0.01"
                    value={thinkingBudget}
                    onChange={(e) => setThinkingBudget(parseFloat(e.target.value))}
                    className="range-input"
                  />
                </div>
                <div className="setting-item">
                  <label className="input-label">画布宽度</label>
                  <input
                    type="number"
                    value={canvasW}
                    onChange={(e) => setCanvasW(parseInt(e.target.value) || 2100)}
                    className="text-input num-input"
                  />
                </div>
                <div className="setting-item">
                  <label className="input-label">画布高度</label>
                  <input
                    type="number"
                    value={canvasH}
                    onChange={(e) => setCanvasH(parseInt(e.target.value) || 1080)}
                    className="text-input num-input"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image upload area */}
        <motion.div
          className="upload-area"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ImageDropZone
            label="美术效果图"
            icon="🎨"
            accent="#6c5ce7"
            image={artImage}
            onImageChange={setArtImage}
          />
          <div className="vs-divider">
            <span className="vs-text">VS</span>
          </div>
          <ImageDropZone
            label="游戏实机截图"
            icon="🖥️"
            accent="#00b894"
            image={gameImage}
            onImageChange={setGameImage}
          />
        </motion.div>

        {/* Analyze button */}
        <motion.div
          className="action-area"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <button
            className={`analyze-btn ${loading ? 'loading' : ''}`}
            disabled={!canAnalyze}
            onClick={handleAnalyze}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="spin" />
                <span>AI 分析中…</span>
              </>
            ) : (
              <>
                <Sparkles size={20} />
                <span>开始对比分析</span>
              </>
            )}
          </button>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="error-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <AlertCircle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        {result && (
          <div className="results-area">
            <div className="results-header">
              <h2 className="results-title">📊 分析报告</h2>
              <SeverityFilter filters={filters} onChange={setFilters} />
            </div>
            <AnalysisResult text={result} filters={filters} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>Powered by Claude · Visual Diff Tool</span>
      </footer>
    </div>
  )
}
