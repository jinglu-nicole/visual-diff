/**
 * [WHO]: 提供 React 应用挂载入口
 * [FROM]: 依赖 react-dom/client, App 组件, index.css 基础样式
 * [TO]: 被 index.html 的 <script> 标签引用
 * [HERE]: frontend/src/main.jsx — React 入口点；StrictMode 包裹
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
