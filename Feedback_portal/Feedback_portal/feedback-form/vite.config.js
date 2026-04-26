import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
// This proxies UI API requests to LocalStack API Gateway
// API Gateway ID: qt2qhtzf3g
const API_GATEWAY_URL = 'http://localhost:4566/restapis/rdobqnzuh1/prod/_user_request_';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_GATEWAY_URL,
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      }
    },
    // Add history API fallback for client-side routing in dev server
    middlewareMode: false,
  },
})
