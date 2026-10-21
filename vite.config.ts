import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Tauri 开发环境下使用固定端口，便于 src-tauri 的 devUrl 对齐
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri 2 的 WebView（WKWebView / WebView2）均为现代内核，直接使用 esnext 目标，
    // 避免降级转换；压缩使用 terser，产物更稳定
    target: 'esnext',
    minify: !process.env.TAURI_ENV_DEBUG ? 'terser' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    // 沙箱环境拦截 rmSync 清空目录，改为保留旧产物直接覆盖
    emptyOutDir: false,
    chunkSizeWarningLimit: 4096,
  },
});
