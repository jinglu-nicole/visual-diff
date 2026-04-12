# 🎮 Visual Diff · 游戏美术效果对比工具

上传美术效果图和游戏实机截图，AI 会分析两者的差距并给出改进建议。

## 架构

```
├── server.py          # FastAPI 后端 API
├── app.py             # Gradio 版本（旧）
├── analyzer.py        # Claude API 调用与分析逻辑
├── config.py          # 配置
├── utils.py           # 工具函数
├── requirements.txt   # Python 依赖
└── frontend/          # React 前端（Vite）
    ├── src/App.jsx    # 主界面
    └── src/App.css    # 样式
```

## 快速启动

### 1. 安装后端依赖

```bash
pip install -r requirements.txt
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
```

### 3. 开发模式

终端 1 — 启动后端：
```bash
python server.py
```

终端 2 — 启动前端：
```bash
cd frontend
npm run dev
```

打开 http://localhost:3000

### 4. 生产构建

```bash
cd frontend && npm run build
cd .. && python server.py
```

打开 http://localhost:8000（FastAPI 直接托管前端构建产物）

## 使用方法

1. 填入 API Key
2. 上传美术效果图和游戏实机截图（支持拖放、粘贴）
3. 点击「开始对比分析」
4. 查看分析报告，可按严重程度筛选问题
