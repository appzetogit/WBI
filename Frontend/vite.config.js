import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // Ensure only one React instance across all chunks
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5174,
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
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;

          // Firebase — very large (~367 KB), completely standalone, zero React deps at init
          if (
            id.includes('node_modules/firebase/') ||
            id.includes('node_modules/@firebase/')
          ) {
            return 'firebase-vendor';
          }

          // GSAP — standalone animation engine, zero React dependency
          if (id.includes('node_modules/gsap/')) {
            return 'gsap-vendor';
          }

          // ALL other node_modules go into ONE vendor chunk.
          // This includes React, react-dom, react-router, @tanstack/react-query,
          // framer-motion, leaflet, react-leaflet, @react-google-maps, recharts,
          // react-icons, lucide-react, axios, socket.io-client, dayjs, zod, etc.
          //
          // WHY: libraries like @tanstack/react-query, framer-motion, react-leaflet
          // and recharts call React.createContext() at MODULE EVALUATION TIME.
          // When React is in a separate chunk, there is a race: if the browser
          // evaluates the vendor chunk before react-vendor finishes, React is
          // undefined → "Cannot read properties of undefined (reading 'createContext')".
          //
          // Keeping everything in one chunk guarantees Rollup initialises React
          // first (it appears at the top of the file) before any dependent lib runs.
          return 'vendor';
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
      'sonner',
    ],
  },
})