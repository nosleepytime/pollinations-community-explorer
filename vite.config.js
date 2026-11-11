import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { modelsHandler } from './api/models.js';

export default defineConfig({
  plugins: [react(), {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/models', async (req, res) => {
        req.url = `/api/models${req.url || ''}`;
        await modelsHandler(req,res);
      });
    }
  }],
  server: { host: '0.0.0.0' }
});
