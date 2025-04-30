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

      // ★★★ 追加: 分析結果データと相性診断結果データを取得 ★★★
      let analysisResultsForJs = []; // JSでプルダウン等に使用するリスト
      let compatibilityResults = []; // JSで一覧表示に使用するリスト
      const fetchPromises = [];

      // 分析結果 (`result:*`) の取得プロミスを追加
      resultKeys.forEach(key => {
        fetchPromises.push(
          c.env.KV.get(key.name).then(resString => {
            if (!resString) return null;
            try {
              const data = JSON.parse(resString);
              // JS用に名前とIDのリストを作成
              analysisResultsForJs.push({
                resultId: data.resultId,
                name: `${data.inputs?.familyName || ''} ${data.inputs?.firstName || ''}`.trim(),
                registrationNumber: data.registrationNumber ?? null,
              });
              return data; // テーブル表示用のデータも返す
            } catch (e) {
              console.error(`Failed to parse result data for key ${key.name}:`, e);
              return null;
            }
          })
        );
      });

      // 相性診断結果 (`compatibility:*`) の取得プロミスを追加
      const listCompatibilityResult = await c.env.KV.list({ prefix: `compatibility:${pageId}:` });
      listCompatibilityResult.keys.forEach(key => {
        fetchPromises.push(
          c.env.KV.get(key.name).then(resString => {
            if (!resString) return null;
            try {
              compatibilityResults.push(JSON.parse(resString));
              return null; // こちらは analysisResultsForJs には追加しない
            } catch (e) {
              console.error(`Failed to parse compatibility data for key ${key.name}:`, e);
              return null;
            }
          })
        );
      });

      // 全てのデータ取得を並列実行
      const allFetchedData = (await Promise.all(fetchPromises)).filter(data => data !== null);
      // allFetchedData には 分析結果のデータのみが含まれる (相性診断結果は compatibilityResults に直接 push されるため)

      // 分析結果一覧テーブル用のデータ準備 (resultsData)
      let resultsData = allFetchedData; // 分析結果のみ
      resultsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // JS用の分析結果リストを名前でソート
      analysisResultsForJs.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      // JS用の相性診断結果リストを作成日時でソート (新しい順)
      compatibilityResults.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // ★★★ ここまでデータ取得追加 ★★★

      let resultsHtml = '<p>分析結果はまだありません。</p>'; // デフォルトメッセージ

      if (resultsData && resultsData.length > 0) {
        // 4. HTMLテーブル行を生成
        const tableRows = resultsData.map(resultData => {
            const input = resultData.inputs;
            const createdAt = new Date(resultData.createdAt).toLocaleString('ja-JP');
            // ★ 詳細ページへのリンクを修正
            const detailUrl = `/c/${pageId}/results/${resultData.resultId}`;
            // ★ registrationNumber を取得 (存在しない場合は空文字)
            const registrationNumberDisplay = resultData.registrationNumber ?? '';
            return `
              <tr>
                <td class="border px-4 py-2 text-center">${registrationNumberDisplay}</td>
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
                  <th class="px-4 py-2 text-center">登録No</th>
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

      // ★★★ 追加: 取得したデータをJSONとしてHTMLに埋め込む ★★★
      const scriptDataInjection = `
        <script>
          window.analysisResultsList = ${JSON.stringify(analysisResultsForJs)};
          window.compatibilityResultsList = ${JSON.stringify(compatibilityResults)};
          window.currentPageId = "${pageId}"; // API呼び出し用に pageId も渡す
        </script>
      `;
      // </body> の直前に挿入
      htmlContent = htmlContent.replace('</body>', `${scriptDataInjection}</body>`);
      // ★★★ ここまでデータ埋め込み追加 ★★★

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

  // ★★★ 追加: 相性診断詳細ページルート ★★★
  app.get('/:pageId{[a-zA-Z0-9_-]{12}}/compatibility/:compatibilityId{[0-9a-fA-F-]+}', async (c) => {
    const { pageId, compatibilityId } = c.req.param();
    const kvKey = `compatibility:${pageId}:${compatibilityId}`;

    try {
      console.log(`Fetching compatibility result from KV with key: ${kvKey}`);
      const compatibilityString = await c.env.KV.get(kvKey);

      if (!compatibilityString) {
        console.log('Compatibility result not found in KV');
        return c.notFound();
      }
      const compatibilityData = JSON.parse(compatibilityString);

      // ★ 詳細表示用のHTMLテンプレートを取得 (新規作成するファイル名)
      const templateResponse = await c.env.ASSETS.fetch(new Request(new URL('/compatibility_detail.html', c.req.url)));
      if (!templateResponse.ok) {
        console.error('Failed to fetch compatibility_detail.html', templateResponse.status);
        return c.text('Failed to load page template.', 500);
      }
      let htmlContent = await templateResponse.text();

      // ★ プレースホルダを実際のデータで置換 (テンプレートに合わせて調整が必要)
      htmlContent = htmlContent.replace(/__PERSON1_NAME__/g, `${compatibilityData.person1.familyName || ''} ${compatibilityData.person1.firstName || ''}`);
      htmlContent = htmlContent.replace(/__PERSON2_NAME__/g, `${compatibilityData.person2.familyName || ''} ${compatibilityData.person2.firstName || ''}`);
      htmlContent = htmlContent.replace(/__CREATED_AT__/g, new Date(compatibilityData.createdAt).toLocaleString('ja-JP'));
      htmlContent = htmlContent.replace(/__ANALYSIS_WORK_COMPATIBILITY__/g, compatibilityData.analysis?.workCompatibility || '分析結果なし');

      // ★ prosCons を整形して置換
      let prosConsHtml = '分析結果なし';
      const prosConsData = compatibilityData.analysis?.prosCons;
      if (typeof prosConsData === 'object' && prosConsData !== null) {
          const goodPoints = prosConsData['良い点'] || [];
          const badPoints = prosConsData['悪い点'] || [];
          prosConsHtml = ''; // デフォルトをクリア
          if (goodPoints.length > 0) {
              prosConsHtml += '<b>良い点:</b>\n'; // 見出し
              prosConsHtml += goodPoints.map(point => `- ${point}`).join('\n'); // 箇条書き
              prosConsHtml += '\n\n'; // 改行
          }
          if (badPoints.length > 0) {
              prosConsHtml += '<b>悪い点:</b>\n'; // 見出し
              prosConsHtml += badPoints.map(point => `- ${point}`).join('\n'); // 箇条書き
          }
          if (prosConsHtml === '') { // 両方空だった場合
               prosConsHtml = '特に目立った良い点・悪い点はありませんでした。';
          }
      } else if (typeof prosConsData === 'string') { // 文字列の場合も考慮(旧データなど)
          prosConsHtml = prosConsData;
      }
      htmlContent = htmlContent.replace(/__ANALYSIS_PROS_CONS__/g, prosConsHtml);

      htmlContent = htmlContent.replace(/__ANALYSIS_PERFORMANCE_BOOST__/g, compatibilityData.analysis?.performanceBoost || '分析結果なし');
      // 必要に応じて他のプレースホルダも追加・置換

      return c.html(htmlContent);

    } catch (error) {
      console.error(`Error fetching/processing compatibility result ${compatibilityId} for page ${pageId}:`, error);
      if (error instanceof SyntaxError) {
        return c.text('Failed to parse compatibility data.', 500);
      }
      return c.text('Internal Server Error', 500);
    }
  });
  // ★★★ ここまで追加 ★★★

  // --- pageIdの形式が不正な場合 (オプション) ---
  // 上記の ':pageId{[a-zA-Z0-9_-]{12}}' で形式チェックしているので通常は不要だが、
  // より丁寧なエラー処理や、異なる形式のIDを将来的に扱う場合に備えるなら追記
  // app.get('/:pageId', (c) => {
  //   return c.text('Invalid Page ID format.', 400);
  // });

  return app;
};

export default clientRoute;
