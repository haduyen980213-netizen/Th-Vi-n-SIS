let cachedAppPromise = null;

export default async function handler(req, res) {
  try {
    if (!cachedAppPromise) {
      cachedAppPromise = import('./_bundle.mjs').then((mod) => mod.default || mod);
    }
    const app = await cachedAppPromise;
    return await new Promise((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      app(req, res);
    });
  } catch (err) {
    cachedAppPromise = null;
    console.error('Vercel API bootstrap error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: 'SERVERLESS_BOOTSTRAP_ERROR',
            message: err instanceof Error ? err.message : String(err),
          },
        })
      );
    }
  }
}
