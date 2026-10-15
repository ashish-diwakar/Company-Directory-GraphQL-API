import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173, strictPort: true,
  proxy: {
    '/graphql': { target: 'http://127.0.0.1:4000', ws: true },
    '/auth': { target: 'http://127.0.0.1:4000' },
  },
} });
