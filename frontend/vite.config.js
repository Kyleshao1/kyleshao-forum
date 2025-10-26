import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  const API_URL = process.env.VITE_API_URL || 'https://kyleshao-forum-backend.onrender.com'

  return {
    plugins: [react()],
    server: {
      port: 5173,
    build: {
      outDir: 'dist',
    },
    define: {
      'process.env': {},
    },
  }
})
