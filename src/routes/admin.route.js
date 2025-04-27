import { Hono } from 'hono';
import adminAuthMiddleware from '../middleware/auth.js';

/**
 * @typedef {object} CompanyData
 * @property {string} id - 12桁のページID
 * @property {string} companyName
 * @property {string} email
 * @property {string} contactPerson
 * @property {string} phoneNumber
 */

const adminRoute = (app) => {
  // ミドルウェアをこのルートグループ全体に適用するのをやめる
  // app.use('/*', adminAuthMiddleware);

  // --- Admin ページ表示 (GET /) --- : ミドルウェアを個別適用
  app.get('/', adminAuthMiddleware, (c) => {
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin - 会社情報登録</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>
          body { background-color: #f3f4f6; padding: 2rem; }
          .container { max-width: 600px; margin: auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          label { display: block; margin-bottom: 0.5rem; font-weight: 600; color: #374151; }
          input[type="text"], input[type="email"], input[type="tel"] {
            width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #d1d5db; border-radius: 4px;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
          }
          input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.5); }
          button { background-color: #4f46e5; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
          button:hover { background-color: #4338ca; }
          .error-message { color: #ef4444; font-size: 0.875rem; margin-top: 1rem; }
          .success-message { color: #10b981; font-size: 0.875rem; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="text-2xl font-bold mb-6 text-center text-gray-800">会社情報登録</h1>
          <form id="companyForm" method="POST" action="/admin/api/companies">
            <div class="mb-4">
              <label for="pageId">ページID (12桁)</label>
              <input type="text" id="pageId" name="pageId" required minlength="12" maxlength="12" pattern="[a-zA-Z0-9_-]{12}" title="12桁の英数字、ハイフン、アンダースコア">
            </div>
            <div class="mb-4">
              <label for="companyName">会社名</label>
              <input type="text" id="companyName" name="companyName" required>
            </div>
            <div class="mb-4">
              <label for="email">メールアドレス</label>
              <input type="email" id="email" name="email" required>
            </div>
            <div class="mb-4">
              <label for="contactPerson">担当者名</label>
              <input type="text" id="contactPerson" name="contactPerson" required>
            </div>
            <div class="mb-4">
              <label for="phoneNumber">電話番号</label>
              <input type="tel" id="phoneNumber" name="phoneNumber" required>
            </div>
            <div class="text-center">
              <button type="submit">登録</button>
            </div>
          </form>
          <div id="messageArea" class="mt-4 text-center"></div>
        </div>

        <script>
          const form = document.getElementById('companyForm');
          const messageArea = document.getElementById('messageArea');

          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            messageArea.textContent = ''; // Clear previous messages
            messageArea.className = 'mt-4 text-center'; // Reset class

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            // Basic client-side validation for pageId length
            if (data.pageId.length !== 12) {
              messageArea.textContent = 'ページIDは12桁で入力してください。';
              messageArea.classList.add('error-message');
              return;
            }

            try {
              const response = await fetch('/admin/api/companies', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
              });

              const result = await response.json();

              if (response.ok) {
                messageArea.textContent = result.message || '登録が成功しました。';
                messageArea.classList.add('success-message');
                form.reset(); // Clear form on success
              } else {
                messageArea.textContent = result.error || '登録に失敗しました。';
                messageArea.classList.add('error-message');
              }
            } catch (error) {
              console.error('Error submitting form:', error);
              messageArea.textContent = '通信エラーが発生しました。';
              messageArea.classList.add('error-message');
            }
          });
        </script>
      </body>
      </html>
    `;
    return c.html(htmlContent);
  });

  // --- 会社情報登録 API (POST /api/companies) --- : ミドルウェアを個別適用
  app.post('/api/companies', adminAuthMiddleware, async (c) => {
    try {
      /** @type {CompanyData} */
      const body = await c.req.json();

      // --- バリデーション ---
      if (!body.pageId || typeof body.pageId !== 'string' || body.pageId.length !== 12 || !/^[a-zA-Z0-9_-]{12}$/.test(body.pageId)) {
        return c.json({ error: 'ページIDは12桁の英数字、ハイフン、アンダースコアで入力してください。' }, 400);
      }
      if (!body.companyName || typeof body.companyName !== 'string') {
        return c.json({ error: '会社名を入力してください。' }, 400);
      }
       if (!body.email || typeof body.email !== 'string' /* Add more robust email validation if needed */) {
        return c.json({ error: '有効なメールアドレスを入力してください。' }, 400);
      }
      if (!body.contactPerson || typeof body.contactPerson !== 'string') {
        return c.json({ error: '担当者名を入力してください。' }, 400);
      }
      if (!body.phoneNumber || typeof body.phoneNumber !== 'string' /* Add phone number format validation if needed */) {
        return c.json({ error: '電話番号を入力してください。' }, 400);
      }
      // --- バリデーション終了 ---

      const kvKey = `company:${body.pageId}`;
      const companyDataToStore = {
        id: body.pageId,
        companyName: body.companyName,
        email: body.email,
        contactPerson: body.contactPerson,
        phoneNumber: body.phoneNumber,
        // 将来的な拡張のために登録日時などを追加しても良い
        createdAt: new Date().toISOString(),
      };

      await c.env.COMPANY_KV.put(kvKey, JSON.stringify(companyDataToStore));

      return c.json({ message: `会社「${body.companyName}」(ID: ${body.pageId}) を登録しました。` });
    } catch (error) {
      console.error('Error processing company registration:', error);
      if (error instanceof SyntaxError) { // JSON parse error
          return c.json({ error: '無効なリクエスト形式です。' }, 400);
      }
      // KVへの書き込みエラーなども考慮
      return c.json({ error: 'サーバー内部でエラーが発生しました。' }, 500);
    }
  });

  return app;
};

export default adminRoute;
