# EDUCATION_SCOPE_MCP

日本の学校教育で、ある知識・用語・解法が**どの学校段階・学年・教科の範囲か**を判定し、LLMの説明が指定学年を超えていないか監査するMCPサーバーです。

## できること

- `classify_knowledge_scope` — 「三平方の定理」「微分」「現在完了」などの教育範囲を判定
- `check_answer_scope` — 「中2までで説明して」に高校・中3範囲が混ざっていないか監査
- `search_curriculum` — 学校段階・教科・領域・キーワードで検索
- `get_prerequisites` — そのトピックを理解するための前提知識を取得
- `list_supported_scopes` — 監査に指定できる上限学年を取得

## 例

`classify_knowledge_scope("三平方の定理")`

```json
{
  "bestMatch": {
    "stage": "中学校",
    "grade": 3,
    "subject": "数学",
    "domain": "図形",
    "topic": "三平方の定理"
  }
}
```

`check_answer_scope("三平方の定理を使います。", "中2")`

```json
{
  "withinTarget": false,
  "exceedsTarget": [
    {
      "stage": "中学校",
      "grade": 3,
      "topic": "三平方の定理"
    }
  ]
}
```

## セットアップ

Node.js 20以上。

```bash
npm install
npm test
```

### stdio MCP

```bash
npm run build
npm start
```

MCPクライアント設定例:

```json
{
  "mcpServers": {
    "education-scope": {
      "command": "node",
      "args": ["/absolute/path/EDUCATION_SCOPE_MCP/dist/src/index.js"]
    }
  }
}
```

### Remote HTTP MCP

```bash
npm run build
PORT=3000 npm run start:http
```

- MCP endpoint: `http://localhost:3000/mcp`
- health check: `http://localhost:3000/health`

HTTP実装はMCP TypeScript SDK v2の `createMcpHandler` を使用しています。

## 文科省データ

根拠データは文部科学省「教育データ標準」の学習指導要領コードを想定しています。

- 教育データ標準: https://www.mext.go.jp/a_menu/other/data_00001.htm
- 小学校: `82V12`
- 中学校: `83V11`
- 高等学校: `84V10`

公式CSVを取得して、そのままJSON化するimporterを同梱しています。

```bash
npm run import:mext
```

生成先:

```text
data/mext/raw/
  elementary-82V12.json
  junior-high-83V11.json
  high-school-84V10.json
  index.json
```

現在の `src/data.ts` は、MCPをすぐ動かすための**seed正規化データ**です。正式な学習指導要領コードを推測で埋めず、`curriculumCode` は全量正規化が完了するまで未設定にしています。

## 判定設計

教育範囲判定では、単純な学校段階だけでなく次を保持します。

```ts
{
  stage,
  grade,
  subject,
  domain,
  topic,
  aliases,
  prerequisites,
  curriculumCode,
  source
}
```

`check_answer_scope` は未登録概念を自動的に「範囲内」とは判定しません。既知概念を1件も検出できない文章は `unknownTextPresent: true` として安全側に倒します。

## 現在のseed範囲

v0.1では主に以下を入れています。

- 小1〜小6 算数の主要概念
- 中1〜中3 数学の主要概念
- 高校 数学I / II / B / C の主要概念
- 中学英語: 現在完了、関係代名詞
- 中学国語: 古文・漢文の基礎

次の大きな作業は、文科省CSVから**全教科・全項目を正規化した検索インデックスを生成すること**です。

## License

MIT
