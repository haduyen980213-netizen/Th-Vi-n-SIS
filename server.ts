import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './src/db/index.ts';
import { categories, products } from './src/db/schema.ts';
import v1Router from './src/server/routes/v1.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isTsxDev = process.execArgv.some((arg) => arg.includes('tsx'));
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    (!isTsxDev && fs.existsSync(path.resolve(__dirname, 'dist', 'index.html')));

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Production security headers (keep COOP compatible with Google OAuth popup)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (isProd && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
  });

  // Serve generated static preview images and seller preview images in both dev & prod
  // (Private drawing packages in storage/private-vault are NEVER exposed statically)
  app.use(
    '/src/assets/images',
    express.static(path.resolve(__dirname, 'src/assets/images'), {
      maxAge: isProd ? '7d' : 0,
    })
  );
  app.use(
    '/uploads/previews',
    express.static(path.resolve(__dirname, 'storage', 'public-previews'), {
      maxAge: isProd ? '1d' : 0,
    })
  );

  // REST API v1
  app.use('/api/v1', v1Router);

  // SEO endpoints: robots.txt & dynamic PostgreSQL sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host') || '127.0.0.1:3000'}`;
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /tai-khoan\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', async (req, res) => {
    try {
      const baseUrl =
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL.replace(/\/$/, '')
          : `${req.protocol}://${req.get('host') || '127.0.0.1:3000'}`;

      const [activeCats, approvedProducts] = await Promise.all([
        db
          .select({ slug: categories.slug, updatedAt: categories.updatedAt })
          .from(categories)
          .where(and(eq(categories.isActive, true), isNull(categories.deletedAt))),
        db
          .select({ slug: products.slug, updatedAt: products.updatedAt })
          .from(products)
          .where(and(eq(products.approvalStatus, 'APPROVED'), isNull(products.deletedAt)))
          .orderBy(desc(products.updatedAt))
          .limit(500),
      ]);

      const urls: string[] = [
        `<url><loc>${escapeXml(`${baseUrl}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
        `<url><loc>${escapeXml(`${baseUrl}/danh-muc`)}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
        `<url><loc>${escapeXml(`${baseUrl}/ho-tro`)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
      ];

      for (const c of activeCats) {
        urls.push(
          `<url><loc>${escapeXml(`${baseUrl}/danh-muc?category=${encodeURIComponent(c.slug)}`)}</loc><lastmod>${c.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
        );
      }

      for (const p of approvedProducts) {
        urls.push(
          `<url><loc>${escapeXml(`${baseUrl}/ban-ve/${encodeURIComponent(p.slug)}`)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
        );
      }

      res.type('application/xml');
      res.send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
      );
    } catch (err) {
      console.error('Sitemap generation error:', err);
      res.status(500).type('text/plain').send('Sitemap unavailable');
    }
  });

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

  // Global error handler (JSON parse, Multer file limit, unhandled exceptions)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'Dung lượng tệp tải lên vượt quá giới hạn tối đa (25 MB).',
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: 'Lỗi xử lý tệp tải lên.' },
      });
    }

    if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Dữ liệu JSON gửi lên không đúng định dạng.',
        },
      });
    }

    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Hệ thống đang bận, vui lòng thử lại sau ít phút.',
      },
    });
  });

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
