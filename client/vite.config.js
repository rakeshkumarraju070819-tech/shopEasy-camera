import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development, /api and /socket.io calls are forwarded to the Express server
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true, ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    css: false
  }
});
