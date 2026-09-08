import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
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
        '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3400',
      },
    },
  };
});
