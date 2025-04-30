import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import resultsRoute from './routes/results.route.js';
// import companyRoute from './routes/company.route.js'; // 不要になったのでコメントアウトまたは削除
import adminRoute from './routes/admin.route.js'; // 追加
import clientRoute from './routes/client.route.js'; // 追加
import compatibilityRoute from './routes/compatibility.route.js'; // ★ 追加

const app = new Hono();

// --- Hono アプリケーション ---
// ルートパス (".env") - 404 Not Found を返す
// app.get('/', (c) => {
//   return c.notFound();
// }); // このルートを削除

// Admin ルートを追加 (results より前に移動)
app.route('/admin', adminRoute(app));

// 会社専用ページルート (追加)
app.route('/c', clientRoute(app));

// 既存のAPIルート
app.route('/api/compatibility', compatibilityRoute(app));
app.route('/api/results', resultsRoute(app));

// 新しい会社専用ルートを追加 (前回実装分、不要なら削除)
// app.route('/company', companyRoute(app));

// ルートパスのハンドラを明示的に定義 (他のルートにマッチしなかった場合)
app.get('/', (c) => c.text('Welcome to HR Profiling!')); // 追加

// 静的ファイル配信 (public ディレクトリをルートとする)
// 重要: 他の具体的なルートの後に配置する
app.use('/*', serveStatic({ root: './public' }));

// --- Worker エントリーポイント ---
export default {
  async fetch(request, env, context) {
    return app.fetch(request, env, context);
  },
};
