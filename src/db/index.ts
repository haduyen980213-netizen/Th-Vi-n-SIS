import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const maxConnections = Math.max(
      2,
      Math.min(50, Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 5 : 15))
    );
    const isUnixSocket = Boolean(process.env.SQL_HOST?.startsWith('/'));
    const useSsl =
      !isUnixSocket &&
      (process.env.SQL_SSL === 'true' ||
        process.env.SQL_SSL === 'require' ||
        process.env.VERCEL === '1');

    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      port: Number(process.env.SQL_PORT) || 5432,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: maxConnections,
      idleTimeoutMillis: process.env.VERCEL ? 10000 : 30000,
      connectionTimeoutMillis: 15000,
      ...(useSsl
        ? {
            ssl: {
              rejectUnauthorized: process.env.SQL_SSL_REJECT_UNAUTHORIZED === 'true',
            },
          }
        : {}),
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
