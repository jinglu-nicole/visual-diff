# frontend/

> P2 | Parent: ../AGENTS.md

## Member List

index.html: HTML 模板入口，挂载 React 根节点 `#root`，引用 favicon.svg
vite.config.js: Vite 构建配置，启用 @vitejs/plugin-react 插件
package.json: 依赖声明（React 19, lucide-react, react-markdown）

## src/ 源码

src/main.jsx: React 应用入口，StrictMode 包裹 App 组件挂载到 `#root`
src/App.jsx: 主组件，包含 ImageDropZone / SeverityFilter / AnalysisResult 三个子组件，完整的对比分析 UI 逻辑
src/App.css: 亮色工具主题样式，系统字体 + 简洁边框 + 响应式布局，CSS 变量体系
src/index.css: 基础 CSS 重置与排版 token，明暗主题切换（未被 App.css 使用，属 Vite 模板遗留）

## public/ 静态资源

public/favicon.svg: 网站图标
public/icons.svg: SVG 图标集

---

Rule: 成员完整，每项一行，父链接有效

[COVENANT]: 文件变更时更新此列表，与父级 AGENTS.md 保持同步
