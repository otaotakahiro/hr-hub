import { basicAuth } from 'hono/basic-auth';

/**
 * Adminページの認証ミドルウェア
 * 環境変数 ADMIN_PASSWORD に設定されたパスワードでBasic認証を行う
 */
const adminAuthMiddleware = (c, next) => {
  const username = 'admin'; // Basic認証のユーザー名は固定で'admin'とする
  const password = c.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('ADMIN_PASSWORD is not set in environment variables.');
    return c.text('Internal Server Error: Admin password not configured.', 500);
  }

  const auth = basicAuth({
    username: username,
    password: password,
  });

  return auth(c, next);
};

export default adminAuthMiddleware;
