import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo (npm run dev) el servidor de Vite corre en :5173 y hace proxy
// de /api hacia el backend Node en :3000. En producción, Express sirve dist/
// y el /api es del mismo origen (no se usa este proxy).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
