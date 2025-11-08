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
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
})