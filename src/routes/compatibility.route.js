import { Hono } from 'hono';
import { OpenaiService } from '../infrastructures/ai/openai.service.js';

/**
 * @param {Hono} app
 * @returns {Hono}
 */
export default function (app) {
  // --- 相性診断実行 API (POST /analyze) ---
  app.post('/analyze', async context => {
    try {
      const requestBody = await context.req.json();
      const { pageId, resultId1, resultId2 } = requestBody;

      // --- 入力チェック ---
      if (!pageId || !resultId1 || !resultId2) {
        return context.json({ error: 'pageId, resultId1, resultId2 は必須です。' }, 400);
      }
      if (resultId1 === resultId2) {
        return context.json({ error: '異なる二人のデータを選択してください。' }, 400);
      }

      console.log(`Compatibility request received for pageId: ${pageId}, resultId1: ${resultId1}, resultId2: ${resultId2}`);

      // --- KVから分析データを取得 ---
      const kvKey1 = `result:${pageId}:${resultId1}`;
      const kvKey2 = `result:${pageId}:${resultId2}`;

      const [dataString1, dataString2] = await Promise.all([
        context.env.KV.get(kvKey1),
        context.env.KV.get(kvKey2),
      ]);

      if (!dataString1 || !dataString2) {
        console.error('One or both result data not found in KV.', { key1Exists: !!dataString1, key2Exists: !!dataString2 });
        return context.json({ error: '指定された分析データが見つかりません。' }, 404);
      }

      const data1 = JSON.parse(dataString1);
      const data2 = JSON.parse(dataString2);

      // --- OpenAI Service で相性診断実行 ---
      console.log('Calling OpenAI service for compatibility analysis...');
      const openaiService = new OpenaiService(context.env.OPENAI_API_KEY, context.env.OPENAI_MODEL);
      const compatibilityAnalysis = await openaiService.analyzeCompatibility(data1, data2);
      console.log('Compatibility analysis finished.');

      // --- 結果をKVに保存 ---
      // キー生成 (IDをソートして一意にする)
      // const sortedIds = [resultId1, resultId2].sort();
      // const compatibilityKvKey_old = `compatibility:${pageId}:${sortedIds[0]}_${sortedIds[1]}`;
      const compatibilityId = crypto.randomUUID();
      // ★ KVキーを compatibilityId を使う形式に変更
      const compatibilityKvKey = `compatibility:${pageId}:${compatibilityId}`;

      const dataToStore = {
        compatibilityId: compatibilityId,
        pageId: pageId,
        person1: {
          resultId: data1.resultId,
          familyName: data1.inputs.familyName,
          firstName: data1.inputs.firstName,
          registrationNumber: data1.registrationNumber ?? null,
        },
        person2: {
          resultId: data2.resultId,
          familyName: data2.inputs.familyName,
          firstName: data2.inputs.firstName,
          registrationNumber: data2.registrationNumber ?? null,
        },
        analysis: compatibilityAnalysis, // AIからの分析結果
        createdAt: new Date().toISOString(),
      };

      await context.env.KV.put(compatibilityKvKey, JSON.stringify(dataToStore));
      console.log(`Compatibility result saved to KV with key: ${compatibilityKvKey}`);

      // --- 成功レスポンス ---
      return context.json({
        success: true,
        message: '相性診断が完了し、結果を保存しました。',
        compatibilityId: compatibilityId, // 保存した診断結果のID
        result: dataToStore // 保存したデータ全体を返す (UIで即時表示する場合)
      });

    } catch (error) {
      console.error('Error in compatibility route:', error);
      // ★ より詳細なエラー情報をログ出力
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);

      // ★ エラーの種類に関わらず、常にJSONでエラーレスポンスを返す
      let statusCode = 500;
      let errorMessage = '相性診断中にサーバーエラーが発生しました。';

      if (error instanceof SyntaxError) {
        statusCode = 400;
        errorMessage = '無効なリクエスト形式です。';
      } else if (error.message.includes('OpenAI')) {
          statusCode = 503; // OpenAI関連は 503 Service Unavailable
          errorMessage = 'AIによる分析中にエラーが発生しました。時間をおいて再度お試しください。';
      } else if (error.message.includes('not found in KV')) {
          statusCode = 404;
          errorMessage = '指定された分析データが見つかりません。';
      }

      // 必ず JSON 形式でエラーを返す
      return context.json({ error: errorMessage, details: error.message }, statusCode);
    }
  });

  // ★★★ 追加: 相性診断結果 複数削除 API ★★★
  app.post('/bulk-delete', async context => {
    try {
      const body = await context.req.json();
      const pageId = body.pageId;
      const compatibilityIds = body.compatibilityIds; // 削除対象の compatibilityId の配列

      if (!pageId || !Array.isArray(compatibilityIds) || compatibilityIds.length === 0) {
        return context.json({ error: '無効なリクエストです。削除対象のIDを指定してください。' }, 400);
      }

      console.log(`Attempting to delete ${compatibilityIds.length} compatibility results for pageId: ${pageId}`);

      // 各 compatibilityId に対応するKVキーを生成
      const keysToDelete = compatibilityIds.map(compId => `compatibility:${pageId}:${compId}`);

      // KVからキーを削除 (一件ずつ実行)
      const deletePromises = keysToDelete.map(key => {
        console.log(`Deleting KV key: ${key}`);
        return context.env.KV.delete(key);
      });

      await Promise.all(deletePromises);

      console.log(`Successfully deleted ${compatibilityIds.length} compatibility results.`);
      return context.json({ message: `${compatibilityIds.length}件の相性診断結果を削除しました。` });

    } catch (error) {
        console.error('Error deleting compatibility results:', error);
        if (error instanceof SyntaxError) {
            return context.json({ error: '無効なリクエスト形式です。' }, 400);
        }
        return context.json({ error: '削除処理中にエラーが発生しました。' }, 500);
    }
  });
  // ★★★ ここまで追加 ★★★

  return app;
}
