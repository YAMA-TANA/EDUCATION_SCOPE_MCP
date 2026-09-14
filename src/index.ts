#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import {
  checkAnswerScope,
  classifyKnowledgeScope,
  getPrerequisites,
  listTargets,
  searchCurriculum,
} from "./engine.js";

const server = new McpServer({
  name: "education-scope-mcp",
  version: "0.1.0",
});

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

server.registerTool(
  "classify_knowledge_scope",
  {
    description:
      "日本の学校教育において、指定した知識・用語・解法が主にどの学校段階・学年・教科で扱われるかを判定します。例: 三平方の定理、二次方程式、現在完了、微分。",
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
      "教育範囲データから、教科・学校段階・領域・キーワードで項目を検索します。",
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
      "指定したトピックを理解するための前提知識を、教育範囲データ上の依存関係として返します。",
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("education-scope-mcp 0.1.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
