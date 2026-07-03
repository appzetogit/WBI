import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // Ensure only one React instance
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5174, // Change port to bypass cache
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    }
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      },
    },
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // React core — must be its own chunk, loaded first
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/@remix-run/router/')
            ) {
              return 'react-vendor';
            }
            // Firebase — very large, standalone (no React.createContext at init)
            if (
              id.includes('node_modules/firebase/') ||
              id.includes('node_modules/@firebase/')
            ) {
              return 'firebase-vendor';
            }
            // GSAP — standalone, no React dependency at init
            if (id.includes('node_modules/gsap/')) {
              return 'gsap-vendor';
            }
            // xlsx — standalone, no React dependency
            if (id.includes('node_modules/xlsx/')) {
              return 'xlsx-vendor';
            }
            // Everything else (framer-motion, leaflet, react-leaflet,
            // @react-google-maps, recharts, react-icons, lucide-react, etc.)
            // goes into the common vendor chunk so Rollup can guarantee
            // react-vendor is initialized before any of them run.
            return 'vendor';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'react-icons/fi',
      'react-icons/fa',
      'react-icons/io',
      'react-icons/md',
      'react-icons/tb',
      'socket.io-client',
      'framer-motion',
      'axios',
      'dayjs',
      'leaflet',
      'react-leaflet',
      '@react-google-maps/api',
      'recharts',
      'nprogress',
      'react-hot-toast',
    ],
  },
})