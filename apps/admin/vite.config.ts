import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }

          if (id.includes('@ant-design/icons')) {
            return 'antd-icons';
          }

          if (id.includes('/rc-') || id.includes('@rc-component')) {
            return 'antd-rc';
          }

          if (id.includes('/antd/') || id.includes('@ant-design/cssinjs')) {
            return 'antd-core';
          }

          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
