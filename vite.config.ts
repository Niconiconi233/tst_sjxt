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
  /**
   * jszip 只在「文书模板套打」与 docx 导入时按需加载。
   * 若不在启动时预优化，Vite 会在用户第一次触发时才临时优化依赖并整页 reload ——
   * 正好在生成通知书的过程中把页面刷掉，编辑中的内容就丢了。
   *
   * docx-editor 引擎体积大、依赖复杂（HarfBuzz shaping、多语言目录等），
   * 预优化避免首次打开文书编辑器时 Vite 临时优化依赖并整页 reload。
   */
  optimizeDeps: {
    include: ['jszip', '@docx-editor.dev/react', '@docx-editor.dev/core'],
    esbuildOptions: {
      // docx-editor 的 core 用了 top-level await，预优化的默认 target 是 es2020 不支持；
      // 对齐主构建的 esnext 目标（Tauri 的 WKWebView/WebView2 均为现代内核）
      target: 'esnext',
    },
  },
  build: {
    // Tauri 2 的 WebView（WKWebView / WebView2）均为现代内核，直接使用 esnext 目标，
    // 避免降级转换；压缩使用 terser，产物更稳定
    target: 'esnext',
    minify: !process.env.TAURI_ENV_DEBUG ? 'terser' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    // 每次构建前清空 dist：关闭后旧哈希产物会不断堆积（曾累积到 62.9MB，实际产物仅 11.6MB），
    // 无论本地重复打包还是 Tauri 打包进安装包，都会把无用文件一起带上
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
});
