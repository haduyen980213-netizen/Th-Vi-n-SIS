import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './src/db/index.ts';
import { attachErrorHandlers, createApiApp } from './src/server/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isTsxDev = process.execArgv.some((arg) => arg.includes('tsx'));
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    process.env.npm_lifecycle_event === 'preview' ||
    (!isTsxDev && fs.existsSync(path.resolve(__dirname, 'dist', 'index.html')));

  const app = createApiApp({ isProd, rootDir: __dirname });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(
      express.static(distDir, {
        maxAge: '1h',
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(indexFile);
      }
      return res.status(404).send('Build output not found.');
    });
  }

  attachErrorHandlers(app);

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`THƯ VIỆN SIS Server listening on http://0.0.0.0:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}. Gracefully shutting down THƯ VIỆN SIS...`);
    server.close(async () => {
      try {
        await pool.end();
      } catch (poolErr) {
        console.error('Error closing PostgreSQL pool:', poolErr);
      }
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(1);
    }, 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start THƯ VIỆN SIS server:', err);
  process.exit(1);
});
