import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import multer from 'multer';
import path from 'node:path';
import { db } from '../db/index.ts';
import { categories, products } from '../db/schema.ts';
import v1Router from './routes/v1.ts';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createApiApp(options?: { isProd?: boolean; rootDir?: string }) {
  const app = express();
  const rootDir = options?.rootDir || process.cwd();
  const isProd = options?.isProd ?? process.env.NODE_ENV === 'production';

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

  // Serve generated static preview images and seller preview images
  const previewStorageDir = process.env.VERCEL
    ? path.resolve('/tmp', 'sis-storage', 'public-previews')
    : path.resolve(rootDir, 'storage', 'public-previews');

  app.use(
    '/src/assets/images',
    express.static(path.resolve(rootDir, 'src/assets/images'), {
      maxAge: isProd ? '7d' : 0,
    })
  );
  app.use(
    '/uploads/previews',
    express.static(previewStorageDir, {
      maxAge: isProd ? '1d' : 0,
    })
  );

  // REST API v1
  app.use('/api/v1', v1Router);
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: `Không tìm thấy API endpoint (${req.method} ${req.originalUrl}).`,
      },
    });
  });

  // SEO endpoints: robots.txt & dynamic PostgreSQL sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const baseUrl =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL.replace(/\/$/, '')
        : `${req.protocol}://${req.get('host') || '127.0.0.1:3000'}`;
    res.type('text/plain');
    res.send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /tai-khoan\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
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

  return app;
}

export function attachErrorHandlers(app: express.Express) {
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
}
