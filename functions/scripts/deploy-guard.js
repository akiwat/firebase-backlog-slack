// デプロイ時刻ガード: 業務時間中(平日 09:00-18:00 JST)の本番デプロイを中断する。
// 本番の backlog 関数は日中稼働中のため、リビジョン切替による通知欠損を避ける目的。
// どうしても今すぐ必要なときだけ: FORCE=1 firebase deploy --only functions
//
// firebase.json の functions.predeploy から実行される（dry-run でも走る点に注意）。
// 業務時間の定義を変えたい場合は下の WEEKDAYS / START_HOUR / END_HOUR を編集。

const START_HOUR = 9;   // 09:00 JST から
const END_HOUR = 18;    // 18:00 JST まで（18:00 以降は許可）
const WEEKDAYS = [1, 2, 3, 4, 5]; // 月〜金 (0=日, 6=土)

if (process.env.FORCE === '1') {
    console.log('[deploy-guard] FORCE=1 指定のため時刻チェックをスキップします。');
    process.exit(0);
}

// ホストのタイムゾーンに依存せず JST を算出（UTC+9）
const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
const day = jst.getUTCDay();
const hour = jst.getUTCHours();
const min = jst.getUTCMinutes();
const dow = ['日', '月', '火', '水', '木', '金', '土'][day];
const hhmm = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

const isBusinessDay = WEEKDAYS.indexOf(day) !== -1;
const inBusinessHours = hour >= START_HOUR && hour < END_HOUR;

if (isBusinessDay && inBusinessHours) {
    console.error('');
    console.error(`[deploy-guard] 業務時間中（${dow} ${hhmm} JST）のためデプロイを中断しました。`);
    console.error('[deploy-guard] 本番は稼働中です。時間外（平日 18:00 以降 / 土日）に実行してください。');
    console.error('[deploy-guard] どうしても今すぐ必要な場合のみ:');
    console.error('[deploy-guard]   FORCE=1 firebase deploy --only functions');
    console.error('');
    process.exit(1);
}

console.log(`[deploy-guard] ${dow} ${hhmm} JST — 業務時間外。デプロイを続行します。`);
process.exit(0);
