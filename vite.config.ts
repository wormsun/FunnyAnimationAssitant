import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true, // 端口被占用时报错，而不是自动切换
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 开发环境放宽 COEP 策略，允许跨域资源
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  }
})
