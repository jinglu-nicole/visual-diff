# 游戏美术效果对比工具 (Visual Diff)

> P1 | 项目根文档与导航地图

---

## Identity

游戏 GUI 还原度审查工具——上传美术效果图与游戏实机截图，由 Claude Vision 自动分析两者差异并输出结构化评估报告。

---

## 项目概述

**Visual Diff** 是一款专为游戏美术团队设计的 AI 视觉对比工具。用户上传设计稿（目标）和实机截图（实际），系统调用 Claude API 的视觉理解能力，从位置、大小、间距、色彩、字体等 8 个维度生成还原度评分报告。

**核心支柱：**
- **双 UI 模式** — Gradio 快速原型 + React SPA 精致前端，共享同一分析后端
- **深度 Prompt 工程** — 递归组件树拆解、8 维度评分体系、画布适配规则
- **本地预处理辅助** — 颜色主色提取增强模型判断准确度

---

## 架构拓扑

```
|---------------------------------------------------------------|
|                    入口层 (双模式)                               |
|  app.py (Gradio UI)     server.py (FastAPI + React SPA)        |
|---------------------------------------------------------------|
                              |
                              v
|---------------------------------------------------------------|
|                    核心分析层                                    |
|  |-------------------|  |------------|  |------------|         |
|  | analyzer.py       |  | config.py  |  | utils.py   |         |
|  | Claude API 调用    |  | URL/模型   |  | 图像处理    |         |
|  | Prompt 构建        |  | 配置常量   |  | 颜色提取    |         |
|  |-------------------|  |------------|  |------------|         |
|---------------------------------------------------------------|
                              |
                              v
|---------------------------------------------------------------|
|                    前端层 (React SPA)                            |
|  frontend/src/App.jsx — 暗色游戏主题 UI                          |
|  react-markdown 渲染 · lucide-react 图标 · 系统字体              |
|---------------------------------------------------------------|
```

---

## 目录结构

```
视觉对比工具/
├── AGENTS.md              # 本文件 — P1 导航地图
│
├── app.py                 # Gradio 界面入口（独立运行模式）
├── server.py              # FastAPI 后端（React SPA 模式）
├── analyzer.py            # Claude API 调用 + Prompt 构建 + 分析逻辑
├── config.py              # 配置常量（API URL、模型名）
├── utils.py               # 图像工具（base64 转换、MIME 类型、主色提取）
│
├── requirements.txt       # Python 依赖
├── README.md              # 项目简介（HuggingFace Spaces 兼容）
├── 技术方案.md              # 技术方案文档
│
├── frontend/              # React SPA 前端 (P2: frontend/)
│   ├── AGENTS.md          # 前端模块文档
│   ├── package.json       # Node 依赖（React 19, Vite 8, lucide-react）
│   ├── vite.config.js     # Vite 构建配置
│   ├── index.html         # HTML 模板
│   ├── public/            # 静态资源（favicon, icons）
│   └── src/               # 源码
│       ├── App.jsx        # 主组件（完整 UI 逻辑）
│       ├── App.css        # 亮色工具主题样式
│       ├── main.jsx       # React 入口
│       └── index.css      # 基础 CSS 重置
│
└── .gitignore             # Git 忽略规则
```

---

## 构建与运行

```bash
# ===== 方式 A：Gradio 模式（快速启动）=====
pip install -r requirements.txt
python app.py
# 访问 http://localhost:7860

# ===== 方式 B：React + FastAPI 模式 =====
# 1. 安装 Python 依赖
pip install -r requirements.txt
pip install fastapi uvicorn python-multipart

# 2. 构建前端
cd frontend && npm install && npm run build && cd ..

# 3. 启动后端（自动 serve React 构建产物）
python server.py
# 访问 http://localhost:8000
```

---

## 核心抽象

### compare_images() (`analyzer.py`)

核心分析函数。接收两张图片路径 + API 配置，返回结构化 Markdown 分析报告。
- 自动转 base64 编码发送至 Claude Vision API
- 预提取主色调辅助模型颜色判断
- 支持 thinking 模式（自动回退到普通模式）
- 输出格式：组件树 + 问题清单（🔴🟡🟢 三级严重度）+ 8 维度评分表

### split_output() / filter_analysis() (`app.py`)

前端展示辅助函数。将模型输出拆分为组件树与问题清单，并支持按严重程度筛选。

### extract_dominant_colors() (`utils.py`)

本地颜色预处理。使用 Pillow 中值切割量化提取 12 色主色调，以 HEX 格式传入 Prompt 辅助模型准确识色。

---

## 配置路径

| 路径 | 用途 |
|------|------|
| `config.py` | API URL (`ANTHROPIC_BASE_URL`)、模型名 (`MODEL`) |
| `frontend/vite.config.js` | Vite 构建配置 |
| `frontend/package.json` | 前端依赖声明 |
| `requirements.txt` | Python 依赖声明 |

---

## 代码规范

### 语言策略

**源码**：Python（后端）+ JavaScript/JSX（前端）

**文档**：中文优先（面向游戏美术团队）

**注释**：中文 docstring + P3 文件头

### Prompt 规范

Prompt 文本位于 `analyzer.py` 内，结构化为多个带分隔线的段落，修改时保持格式一致。

---

## DIP 导航

### P1 — 根文档

- [P1: 本文件](./AGENTS.md)

### P2 — 模块文档

- [P2: frontend/](./frontend/AGENTS.md) — React SPA 前端，暗色游戏主题 UI

### P3 — 文件契约

**状态**: 🟢 — 所有源文件均已添加 P3 头部

---

**Covenant**: 保持文档-代码同构。目录结构变更时同步更新本文件。
