# EDUCATION_SCOPE_MCP

日本の学校教育で、ある知識・用語・解法が**どの学校段階・学年・教科の範囲か**を判定し、LLMの説明が指定学年を超えていないか監査するMCPサーバーです。

文部科学省の学習指導要領コード表（小学校 `82V12` / 中学校 `83V11` / 高等学校 `84V10`）を取得・正規化して検索でき、手作業seedは自然な別名と前提知識グラフの補助データとして併用します。

## MCP Registry

- Registry name: `io.github.YAMA-TANA/education-scope-mcp`
- Display name: **Education Scope MCP**
- Version: `0.2.0`
- OCI image: `ghcr.io/yama-tana/education-scope-mcp:0.2.0`
- Transport: `stdio`

Registry description:

> Classify Japanese school curriculum scope, audit explanations against grade limits, and search 16,887 normalized MEXT curriculum-code entries.

`server.json` はOfficial MCP Registry向けのmanifestです。`.github/workflows/publish-mcp.yml` がOCIイメージをGHCRへ公開し、GitHub Actions OIDCでRegistryへ送信します。追加のRegistry用シークレットは不要です。

## MCP tools

- `classify_knowledge_scope` — 「三平方の定理」「微分」「現在完了」などの教育範囲を判定
- `check_answer_scope` — 「中2までで説明して」に高校・中3範囲が混ざっていないか監査
- `search_curriculum` — 学校段階・教科・領域・キーワードで公式コード表を検索
- `get_prerequisites` — そのトピックを理解するための前提知識を取得
- `list_supported_scopes` — 監査に指定できる上限学年を取得
- `get_dataset_status` — 全量MEXTデータがロード済みか、コード表別件数とともに確認

## 例

`classify_knowledge_scope("三平方の定理")`

```json
{
  "bestMatch": {
    "stage": "中学校",
    "grade": 3,
    "subject": "数学",
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

### Docker / OCI

```bash
docker run --rm -i ghcr.io/yama-tana/education-scope-mcp:0.2.0
```

### Remote HTTP MCP

```bash
npm run build
PORT=3000 npm run start:http
```

- MCP endpoint: `http://localhost:3000/mcp`
- health check: `http://localhost:3000/health`

HTTP実装はMCP TypeScript SDK v2の `createMcpHandler` を使用しています。

## 文科省データを全量取り込む

```bash
npm run import:mext
```

このコマンドは3つの公式CSVを取得し、raw保存だけでなく**MCPが直接読める正規化済みデータ**まで生成します。

```text
data/mext/raw/
  elementary-82V12.json
  junior-high-83V11.json
  high-school-84V10.json
  index.json

data/mext/normalized/
  curriculum-items.json
  summary.json
```

`curriculum-items.json` が存在すれば、MCP起動時に自動で読み込みます。存在しない環境でもseed-onlyモードで起動できます。現在どちらのモードかは `get_dataset_status` で確認できます。

公式コード表から保持する主な情報:

```ts
{
  stage,
  grade,
  grades,
  subject,
  course,
  domain,
  topic,
  aliases,
  curriculumCode,
  codeTable,
  itemNumber,
  sectionPath,
  source
}
```

学年は16桁の学習指導要領コードの学年・段階欄を解釈します。複数学年にまたがるコードは `grades` に全学年を保持し、学年上限監査では安全側に倒すため、その範囲の上端を `grade` として使用します。高等学校は学年を推測して付与しません。

## 自動更新

`.github/workflows/refresh-mext.yml` は文科省CSVを取得し、正規化・テスト・件数検証を通過した場合だけ `data/mext/normalized/` をmainへコミットします。毎月1日の定期更新と手動実行に対応しています。

raw CSV由来JSONはGit管理対象外で、MCPが必要とする正規化済みJSONだけをリポジトリに保持します。

## 判定設計

公式コード表は「何を扱うか」の一次根拠として優先し、`src/data.ts` のseedは次の補助用途に残しています。

- 「三平方」「ピタゴラスの定理」のような自然なalias
- 概念間の前提知識グラフ
- 公式データをまだ生成していない環境のフォールバック

`check_answer_scope` は未登録概念を自動的に「範囲内」とは判定しません。既知概念を1件も検出できない文章は `unknownTextPresent: true` として安全側に倒します。

## データソース

文部科学省「教育データ標準」学習指導要領コード表:

- https://www.mext.go.jp/a_menu/other/data_00001.htm
- 小学校 `82V12`
- 中学校 `83V11`
- 高等学校 `84V10`

## License

MIT
