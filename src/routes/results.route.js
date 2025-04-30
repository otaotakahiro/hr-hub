import { AnimalEntity } from '../domains/animal.entity';
// import { ManeqlService } from '../infrastructures/sites/maneql.service';
import { AngrytellerService } from '../infrastructures/sites/angryteller.service';
import { AstrolineService } from '../infrastructures/sites/astroline.service';
import { AskOracleService } from '../infrastructures/sites/ask-oracle.service';
import OpenaiService from '../infrastructures/ai/openai.service';
import { AoiService } from '../infrastructures/sites/aoi/aoi.service';

/**
 * @param {Hono} app
 * @returns {Hono}
 */
export default function (app) {
  // 結果を作成
  app.post('/', async context => {
    try {
      console.log('Request received for /api/results');
      const requestBody = await context.req.json();
      console.log('Request body:', requestBody);

      // ★ pageId をリクエストボディから取得
      const pageId = requestBody.pageId;
      if (!pageId) {
          console.error('pageId is missing in the request body');
          return context.json({ error: '会社情報がリクエストに含まれていません (pageId missing)' }, 400);
      }
      // ★ 必要であれば pageId の形式チェックを追加
      // if (typeof pageId !== 'string' || !/^[a-zA-Z0-9_-]{12}$/.test(pageId)) {
      //   return context.json({ error: '無効な会社情報形式です (Invalid pageId format)' }, 400);
      // }

      // 生年月日を取得
      const birthDate = new Date(requestBody.birthdate);
      console.log('Birth date:', birthDate);

      // 動物を取得
      const animalEntity = new AnimalEntity(birthDate);
      console.log('Animal entity:', animalEntity);

      // 各種占いサイトのサービスをインスタンス化
      // const maneqlSite = new ManeqlService(animalEntity.animal);
      const aoiService = new AoiService(animalEntity.character, requestBody.gender);
      const angrytellerService = new AngrytellerService(requestBody.familyName, requestBody.firstName);
      const astrolineService = new AstrolineService(birthDate);
      const askOracleService = new AskOracleService(birthDate);

      console.log('Fetching content from external services...');
      // xxxContentに各サイトの内容を格納
      const [aoiContent, angrytellerContent, astrolineContent, askOracleContent] = await Promise.all([
        // maneqlSite.getContent(),
        aoiService.getContent(),
        angrytellerService.getContent(),
        astrolineService.getContent(),
        askOracleService.getContent(),
      ]);
      console.log('External content fetched');

      // プロンプト: コンテンツ部分
      const contentsPrompBuilder = [];

      // if (maneqlContent) {
      //   contentsPrompBuilder.push(`## 動物占いの結果\n\n${maneqlContent}`);
      // }

      if (aoiContent) {
        contentsPrompBuilder.push(`## 動物占いの結果\n\n${aoiContent}`);
      }

      if (angrytellerContent) {
        contentsPrompBuilder.push(`## 姓名診断の結果\n\n${angrytellerContent}`);
      }

      if (astrolineContent) {
        contentsPrompBuilder.push(`## 占星術出生図の結果\n\n${astrolineContent}`);
      }

      if (askOracleContent) {
        contentsPrompBuilder.push(`## 数秘術の結果\n\n${askOracleContent}`);
      }

      // プロンプト: コンテンツ部分
      const contentsPrompt = contentsPrompBuilder.join('\n\n');
      console.log('Content prompt prepared');

      // ユーザーデータの準備
      const fullName = `${requestBody.familyName} ${requestBody.firstName}`;
      const birthDateFormatted = `${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日`;
      const genderFormatted = requestBody.gender === 'male' ? '男性' : '女性';
      const analysisDate = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });

      const userData = {
        name: fullName,
        familyName: requestBody.familyName,
        firstName: requestBody.firstName,
        birthDate: birthDateFormatted,
        gender: genderFormatted,
        analysisDate: analysisDate,
        contentsPrompt: contentsPrompt,
        animalCharacter: animalEntity.character,
        // ★ userDataにもpageIdを追加しておくと後で役立つかも
        pageId: pageId
      };

      // AIによる分析
      console.log('Starting OpenAI analysis...');
      const openaiService = new OpenaiService(context.env.OPENAI_API_KEY, context.env.OPENAI_MODEL);
      const analysisResultData = await openaiService.analyzeAll(userData);
      console.log('OpenAI analysis completed');

      // ★ 結果保存処理の変更
      // 1. この分析結果自体のユニークIDを生成 (resultId)
      const resultId = crypto.randomUUID();

      // ★★★ 新規追加: registrationNumber の採番 ★★★
      // 現在の会社IDに紐づく結果の数を取得して +1 する (簡易的なシーケンス)
      const listResult = await context.env.KV.list({ prefix: `result:${pageId}:` });
      const registrationNumber = listResult.keys.length + 1;
      console.log(`Generated registration number: ${registrationNumber}`);
      // ★★★ ここまで追加 ★★★

      // 2. 保存するデータを作成 (分析結果 + 入力データなど)
      const dataToStore = {
        resultId: resultId,
        pageId: pageId, // どの会社のデータか
        registrationNumber: registrationNumber, // ★★★ 追加 ★★★
        inputs: { // 分析時の入力値も保存
          familyName: requestBody.familyName,
          firstName: requestBody.firstName,
          familyNameKana: requestBody.familyNameKana,
          firstNameKana: requestBody.firstNameKana,
          birthdate: requestBody.birthdate,
          gender: requestBody.gender,
        },
        analysis: analysisResultData, // AIからの分析結果
        createdAt: new Date().toISOString(), // 保存日時
      };

      // 3. 新しい形式のキーでKVに保存
      const kvKey = `result:${pageId}:${resultId}`;
      await context.env.KV.put(kvKey, JSON.stringify(dataToStore));
      console.log(`Result saved to KV with key: ${kvKey}`);

      // ★ レスポンスとして resultId を返す (以前は id という名前だった)
      return context.json({
        id: resultId, // フロントエンドは `result.id` で受け取る想定
      });
    } catch (error) {
      console.error('Error in results route:', error);
      console.error('Error stack:', error.stack);
      return context.json(
        {
          error: '分析中にエラーが発生しました',
          details: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
        500,
      );
    }
  });

  // --- ★ 結果削除 API (POST /delete) ---
  app.post('/delete', async context => {
      try {
          const body = await context.req.json();
          const pageId = body.pageId;
          const resultIds = body.resultIds; // 削除対象の resultId の配列

          if (!pageId || !Array.isArray(resultIds) || resultIds.length === 0) {
              return context.json({ error: '無効なリクエストです。削除対象のIDを指定してください。' }, 400);
          }

          // pageId の形式チェック (任意)
          // if (typeof pageId !== 'string' || !/^[a-zA-Z0-9_-]{12}$/.test(pageId)) { ... }

          console.log(`Attempting to delete ${resultIds.length} results for pageId: ${pageId}`);

          // 各 resultId に対応するKVキーを生成
          const keysToDelete = resultIds.map(resultId => `result:${pageId}:${resultId}`);

          // KVからキーを削除 (一件ずつ実行)
          const deletePromises = keysToDelete.map(key => {
              console.log(`Deleting key: ${key}`);
              return context.env.KV.delete(key);
          });

          await Promise.all(deletePromises);

          console.log(`Successfully deleted ${resultIds.length} results.`);
          return context.json({ message: `${resultIds.length}件の結果を削除しました。` });

      } catch (error) {
          console.error('Error deleting results:', error);
          if (error instanceof SyntaxError) {
              return context.json({ error: '無効なリクエスト形式です。' }, 400);
          }
          return context.json({ error: '削除処理中にエラーが発生しました。' }, 500);
      }
  });

  // 結果を取得
  app.get('/:id', async context => {
    const id = context.req.param('id');
    // ★注意: このGETエンドポイントは現状 pageId を考慮していないため、
    // 全ての会社の結果の中からIDだけで検索してしまう。
    // 将来的に `/c/:pageId/results/:resultId` のような形にするか、
    // クエリパラメータで pageId を渡すなどの修正が必要。
    // 今回はPOST側の修正のみ。
    const result = await context.env.KV.get(id); // ← これは UUID だけでは動かなくなる可能性が高い

    if (!result) {
      return context.json({ error: 'Result not found' }, 404);
    }
    return context.json({
      id, // これはUUID (resultId)
      result: JSON.parse(result),
    });
  });

  return app;
}
