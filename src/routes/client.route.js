import { Hono } from 'hono';

/**
 * @typedef {object} CompanyData
 * @property {string} id
 * @property {string} companyName
 * @property {string} email
 * @property {string} contactPerson
 * @property {string} phoneNumber
 * @property {string} createdAt
 */

const clientRoute = (app) => {
  // --- 会社専用ページ表示 (GET /c/:pageId) ---
  app.get('/:pageId{[a-zA-Z0-9_-]{12}}', async (c) => {
    const { pageId } = c.req.param();
    const kvKey = `company:${pageId}`;

    try {
      // 1. KVから会社情報を取得
      const companyInfoString = await c.env.COMPANY_KV.get(kvKey);
      if (!companyInfoString) {
        console.log(`Company data not found for ID: ${pageId}`);
        return c.notFound();
      }
      /** @type {CompanyData} */
      const companyInfo = JSON.parse(companyInfoString);

      // 2. この会社に関連する分析結果のキーリストを取得
      const listResult = await c.env.KV.list({ prefix: `result:${pageId}:` });
      const resultKeys = listResult.keys;

      let resultsHtml = '<p>分析結果はまだありません。</p>'; // デフォルトメッセージ

      if (resultKeys && resultKeys.length > 0) {
        // 3. 各キーに対応する結果データを取得
        const resultsDataPromises = resultKeys.map(async (key) => {
          const resultString = await c.env.KV.get(key.name);
          if (!resultString) return null;
          try {
            return JSON.parse(resultString);
          } catch (e) {
            console.error(`Failed to parse result data for key ${key.name}:`, e);
            return null;
          }
        });
        let resultsData = (await Promise.all(resultsDataPromises)).filter(data => data !== null);

        // ★ createdAt 降順 (新しい順) でソート
        resultsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 4. HTMLテーブル行を生成
        const tableRows = resultsData.map(resultData => {
            const input = resultData.inputs;
            const createdAt = new Date(resultData.createdAt).toLocaleString('ja-JP');
            // ★ 詳細ページへのリンクを修正
            const detailUrl = `/c/${pageId}/results/${resultData.resultId}`;
            return `
              <tr>
                <td class="border px-4 py-2"><a href="${detailUrl}" class="text-blue-600 hover:underline" target="_blank">${input.familyName || ''} ${input.firstName || ''}</a></td>
                <td class="border px-4 py-2">${input.birthdate || ''}</td>
                <td class="border px-4 py-2">${input.gender === 'male' ? '男性' : input.gender === 'female' ? '女性' : ''}</td>
                <td class="border px-4 py-2">${createdAt}</td>
                <td class="border px-4 py-2 action-col">
                  <input type="checkbox" name="deleteIds" value="${resultData.resultId}" class="delete-checkbox">
                </td>
              </tr>
            `;
        }).join('');

        if (tableRows) {
          resultsHtml = `
            <table class="table-auto w-full">
              <thead>
                <tr>
                  <th class="px-4 py-2">名前</th>
                  <th class="px-4 py-2">生年月日</th>
                  <th class="px-4 py-2">性別</th>
                  <th class="px-4 py-2">分析日時</th>
                  <th class="px-4 py-2 action-col">削除</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          `;
        }
      }

      // 5. public/company_template.html を取得
      const templateResponse = await c.env.ASSETS.fetch(new Request(new URL('/company_template.html', c.req.url)));
      if (!templateResponse.ok) {
          console.error('Failed to fetch company_template.html', templateResponse.status);
          return c.text('Failed to load page template.', 500);
      }
      let htmlContent = await templateResponse.text();

      // 6. プレースホルダを置換
      htmlContent = htmlContent.replace(/__COMPANY_NAME__/g, companyInfo.companyName || '' );
      htmlContent = htmlContent.replace(/__CONTACT_PERSON__/g, companyInfo.contactPerson || '' );
      const createdAtDate = companyInfo.createdAt ? new Date(companyInfo.createdAt).toLocaleDateString('ja-JP') : '不明';
      htmlContent = htmlContent.replace(/__CREATED_AT__/g, createdAtDate);
      htmlContent = htmlContent.replace(/__PAGE_ID__/g, pageId);
      htmlContent = htmlContent.replace(/<div id="resultsList">.*?<\/div>/s, `<div id="resultsList">${resultsHtml}</div>`);

      // 7. 置換後のHTMLを返す
      return c.html(htmlContent);

    } catch (error) {
      console.error(`Error processing /c/${pageId}:`, error);
      if (error instanceof SyntaxError) {
          console.error('Failed to parse company data from KV for ID:', pageId);
          return c.text('Failed to load company data.', 500);
      }
      // ASSETS.fetch でのエラーなども考慮
      return c.text('Internal Server Error', 500);
    }
  });

  // --- ★★★ ここから修正: 分析結果詳細ページ表示 (タブUIを使用) ★★★ ---
  app.get('/:pageId{[a-zA-Z0-9_-]{12}}/results/:resultId{[0-9a-fA-F-]+}', async (c) => {
    const { pageId, resultId } = c.req.param();
    const kvKey = `result:${pageId}:${resultId}`;

    try {
      console.log(`Fetching result from KV with key: ${kvKey}`);
      const resultString = await c.env.KV.get(kvKey);

      if (!resultString) {
        console.log('Result not found in KV');
        return c.notFound();
      }

      // ★ KVから取得したデータをパース
      const resultData = JSON.parse(resultString);

      // ★ public/result-tabs.html をテンプレートとして取得
      const templateResponse = await c.env.ASSETS.fetch(new Request(new URL('/result-tabs.html', c.req.url)));
      if (!templateResponse.ok) {
        console.error('Failed to fetch result-tabs.html', templateResponse.status);
        return c.text('Failed to load page template.', 500);
      }
      let htmlContent = await templateResponse.text();

      // ★ 取得した結果データをJSON文字列に変換し、window.profileDataとしてHTMLに埋め込む
      //    null や undefined を "null" や "undefined" にしないように replacer を使う
      const profileDataJson = JSON.stringify(resultData, (key, value) => {
          return typeof value === 'undefined' ? null : value; // undefined を null に変換
      });

      // </body> の直前にスクリプトを挿入
      const scriptToInject = `<script>window.profileData = ${profileDataJson};</script>`;
      htmlContent = htmlContent.replace('</body>', `${scriptToInject}</body>`);

      // ★ 修正したHTMLを返す
      return c.html(htmlContent);

    } catch (error) {
      console.error(`Error fetching/processing result ${resultId} for page ${pageId}:`, error);
      if (error instanceof SyntaxError) {
        return c.text('Failed to parse result data.', 500);
      }
      return c.text('Internal Server Error', 500);
    }
  });
  // --- ★★★ ここまで修正 ★★★ ---

  // --- pageIdの形式が不正な場合 (オプション) ---
  // 上記の ':pageId{[a-zA-Z0-9_-]{12}}' で形式チェックしているので通常は不要だが、
  // より丁寧なエラー処理や、異なる形式のIDを将来的に扱う場合に備えるなら追記
  // app.get('/:pageId', (c) => {
  //   return c.text('Invalid Page ID format.', 400);
  // });

  return app;
};

export default clientRoute;
