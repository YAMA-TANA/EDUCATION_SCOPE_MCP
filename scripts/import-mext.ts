#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeMextDatasets,
  type RawMextDataset,
} from "../src/mext.js";
import type { SchoolStage } from "../src/types.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = resolve(ROOT, "data/mext/raw");
const NORMALIZED_DIR = resolve(ROOT, "data/mext/normalized");

interface SourceDefinition {
  stage: SchoolStage;
  codeTable: string;
  url: string;
  file: string;
}

const SOURCES: SourceDefinition[] = [
  {
    stage: "小学校",
    codeTable: "82V12",
    url: "https://www.mext.go.jp/content/20230901-mxt_syoto01-000010374_27.csv",
    file: "elementary-82V12.json",
  },
  {
    stage: "中学校",
    codeTable: "83V11",
    url: "https://www.mext.go.jp/content/20230901-mxt_syoto01-000010374_09.csv",
    file: "junior-high-83V11.json",
  },
  {
    stage: "高等学校",
    codeTable: "84V10",
    url: "https://www.mext.go.jp/content/20230901-mxt_syoto01-000010374_01.csv",
    file: "high-school-84V10.json",
  },
];

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((candidate) =>
    candidate.some((value) => value.trim() !== ""),
  );
}

function normalizeHeaders(row: string[]): string[] {
  const seen = new Map<string, number>();
  return row.map((value, index) => {
    const base = value.replace(/^\uFEFF/, "").trim() || `column_${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function rowsToObjects(rows: string[][]): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = normalizeHeaders(rows[0]);
  const objects = rows.slice(1).map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ),
  );
  return { headers, rows: objects };
}

async function fetchSource(source: SourceDefinition): Promise<RawMextDataset> {
  console.error(`Fetching ${source.stage} ${source.codeTable}...`);
  const response = await fetch(source.url, {
    headers: {
      "user-agent":
        "education-scope-mcp/0.2 (+https://github.com/YAMA-TANA/EDUCATION_SCOPE_MCP)",
    },
  });

  if (!response.ok) {
    throw new Error(`${source.url}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsed = rowsToObjects(parseCsv(decode(bytes)));
  const importedAt = new Date().toISOString();
  const dataset: RawMextDataset = {
    stage: source.stage,
    codeTable: source.codeTable,
    sourceUrl: source.url,
    importedAt,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    rows: parsed.rows,
  };

  const rawPath = resolve(RAW_DIR, source.file);
  await writeFile(rawPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.error(`Wrote ${rawPath} (${parsed.rows.length} rows)`);
  return dataset;
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(NORMALIZED_DIR, { recursive: true });

  const datasets: RawMextDataset[] = [];
  for (const source of SOURCES) {
    datasets.push(await fetchSource(source));
  }

  const normalized = normalizeMextDatasets(datasets);
  const normalizedPath = resolve(NORMALIZED_DIR, "curriculum-items.json");
  await writeFile(
    normalizedPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    resolve(RAW_DIR, "index.json"),
    `${JSON.stringify(
      {
        importedAt: normalized.generatedAt,
        sources: normalized.sources.map((source, index) => ({
          ...source,
          file: SOURCES[index]?.file,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(
    resolve(NORMALIZED_DIR, "summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: normalized.schemaVersion,
        generatedAt: normalized.generatedAt,
        itemCount: normalized.itemCount,
        sources: normalized.sources,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.error(
    `Normalized ${normalized.itemCount} curriculum rows -> ${normalizedPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
