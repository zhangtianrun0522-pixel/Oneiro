import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [
      react(),
      {
        name: 'local-api',
        configureServer(server) {
          server.middlewares.use('/api', async (req, res, next) => {
            const pathname = req.url?.split('?')[0]?.replace(/^\/+|\/+$/g, '');

            if (!pathname) {
              next();
              return;
            }

            try {
              const mod = await server.ssrLoadModule(`/api/${pathname}.ts`);
              const handler = mod.default;

              if (typeof handler !== 'function') {
                next();
                return;
              }

              await handler(req, res);
            } catch (error) {
              server.ssrFixStacktrace(error as Error);
              console.error(`Local API error for /api/${pathname}:`, error);

              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
              }

              if (!res.writableEnded) {
                res.end(JSON.stringify({ error: 'Local API error' }));
              }
            }
          });
        },
      },
    ],
    define: {
      'process.env': process.env
    }
  };
});
