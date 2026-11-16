import { attachErrorHandlers, createApiApp } from '../src/server/app.ts';

const app = createApiApp({ isProd: true });
attachErrorHandlers(app);

export default app;
