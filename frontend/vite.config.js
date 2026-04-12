/**
 * [WHO]: 提供 Vite 构建配置（React 插件）
 * [FROM]: 依赖 vite, @vitejs/plugin-react
 * [TO]: 被 vite dev/build 命令消费
 * [HERE]: frontend/vite.config.js — 构建配置；纯前端架构，无后端代理
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
})
