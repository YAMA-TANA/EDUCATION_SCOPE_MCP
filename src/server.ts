import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  checkAnswerScope,
  classifyKnowledgeScope,
  getDatasetStatus,
  getPrerequisites,
  listTargets,
  searchCurriculum,
} from "./engine.js";

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createEducationScopeServer(): McpServer {
  const server = new McpServer({
    name: "education-scope-mcp",
    version: "0.2.0",
  });

  server.registerTool(
    "classify_knowledge_scope",
    {
      description:
        "日本の学校教育において、指定した知識・用語・解法が主にどの学校段階・学年・教科で扱われるかを判定します。文部科学省の正規化済み学習指導要領コード表が利用可能な場合はそれを優先します。",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("判定したい知識、用語、解法、文法事項など"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("曖昧な場合に返す候補数"),
      }),
    },
    async ({ query, limit }) => jsonResult(classifyKnowledgeScope(query, limit)),
  );

  server.registerTool(
    "check_answer_scope",
    {
      description:
        "説明文や解答に、指定した学年より後で学ぶ既知概念が混ざっていないか監査します。『中2までで説明して』のような制約チェック向けです。未登録概念は安全判定せず未判定にします。",
      inputSchema: z.object({
        answer: z.string().min(1).describe("監査したい説明文・解答"),
        target: z
          .enum([
            "小1",
            "小2",
            "小3",
            "小4",
            "小5",
            "小6",
            "中1",
            "中2",
            "中3",
            "高校まで",
          ])
          .describe("許可する知識範囲の上限"),
      }),
    },
    async ({ answer, target }) => jsonResult(checkAnswerScope(answer, target)),
  );

  server.registerTool(
    "search_curriculum",
    {
      description:
        "教育範囲データから、教科・学校段階・領域・キーワードで項目を検索します。公式データでは学習指導要領コードも結果に含まれます。",
      inputSchema: z.object({
        query: z.string().optional().describe("検索語。省略時はフィルタのみ"),
        stage: z
          .enum(["小学校", "中学校", "高等学校"])
          .optional()
          .describe("学校段階"),
        subject: z.string().optional().describe("教科・科目名。例: 数学、数学II、英語"),
        domain: z.string().optional().describe("領域名。例: 図形、関数、文法"),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async ({ query, stage, subject, domain, limit }) =>
      jsonResult(searchCurriculum({ query, stage, subject, domain, limit })),
  );

  server.registerTool(
    "get_prerequisites",
    {
      description:
        "指定したトピックを理解するための前提知識を返します。公式コード表に概念依存関係がない場合は、同梱seedの前提知識グラフを補助的に使用します。",
      inputSchema: z.object({
        topic: z.string().min(1).describe("対象トピック"),
        depth: z
          .number()
          .int()
          .min(0)
          .max(5)
          .default(2)
          .describe("前提知識を何段階たどるか"),
      }),
    },
    async ({ topic, depth }) => jsonResult(getPrerequisites(topic, depth)),
  );

  server.registerTool(
    "list_supported_scopes",
    {
      description: "check_answer_scope で指定できる教育範囲の上限一覧を返します。",
      inputSchema: z.object({}),
    },
    async () => jsonResult(listTargets()),
  );

  server.registerTool(
    "get_dataset_status",
    {
      description:
        "文部科学省の正規化済み全量データがロードされているか、コード表ごとの件数とともに返します。",
      inputSchema: z.object({}),
    },
    async () => jsonResult(getDatasetStatus()),
  );

  return server;
}
