import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'configure-server',
      configureServer(server) {
        // Disable host check by rewriting all incoming hosts to localhost
        server.middlewares.use((req, res, next) => {
          req.headers.host = 'localhost:5173'
          next()
        })
      }
    }
  ],
  root: path.resolve(__dirname),
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Copy public folder contents to dist root
    copyPublicDir: true
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
})