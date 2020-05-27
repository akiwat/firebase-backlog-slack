# firebase-backlog-slack

### 事前設定

```
// firebase cli は事前にインストールしておきます
// ソースをクローンします
$ git clone https://github.com/akiwat/firebase-backlog-slack.git
// 移動して依存パッケージをインストール
$ cd firebase-backlog-slack/functions
$ npm install

// firebaseのプロジェクトと紐付けます。firebaseのプロジェクトは事前に作っておきます
$ firebase use --add

// slackのincoming webhook, backlogのワークスペース名を定義します。devで別の設定を指定することもできます。編集してください。
$ cp ./env.prod.json.sample ./env.prod.json
$ cp ./env.prod.json.sample ./env.dev.json
// backlogのコメント欄に書かれたメンションをslackのuuidに変換したい場合に設定できます。編集してください。
$ cp ./src/config.ts.sample ./src/gonfig.ts
```

### デプロイ

```
$ npm run deploy
```
 
 ### Backlog 設定

 プロジェクトごとにプロジェクト設定>インテグレーション>Webhookから追加

```
// デフォルト設定、slack側で指定したチャネルに投稿
https://us-central1-{yourproject}.cloudfunctions.net/backlog
// 指定したユーザのslackbotに投稿、動作確認などにも利用できる
https://us-central1-{yourproject}.cloudfunctions.net/backlog?channel=@taro
//　Slackで指定したチャネル以外にも投稿可能
https://us-central1-{yourproject}.cloudfunctions.net/backlog?channel=yourchannelname
```
