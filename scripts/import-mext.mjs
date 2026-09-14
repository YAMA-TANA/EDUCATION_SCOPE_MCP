#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(ROOT, "data/mext/raw");

const SOURCES = [
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

function decode(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
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

  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ""));
}

function normalizeHeaders(row) {
  const seen = new Map();
  return row.map((value, index) => {
    const base = value.replace(/^\uFEFF/, "").trim() || `column_${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function rowsToObjects(rows) {
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = normalizeHeaders(rows[0]);
  const objects = rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
  return { headers, rows: objects };
}

async function importSource(source) {
  console.error(`Fetching ${source.stage} ${source.codeTable}...`);
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "education-scope-mcp/0.1 (+https://github.com/YAMA-TANA/EDUCATION_SCOPE_MCP)",
    },
  });

  if (!response.ok) {
    throw new Error(`${source.url}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsed = rowsToObjects(parseCsv(decode(bytes)));
  const output = {
    stage: source.stage,
    codeTable: source.codeTable,
    sourceUrl: source.url,
    importedAt: new Date().toISOString(),
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    rows: parsed.rows,
  };

  const outputPath = resolve(OUTPUT_DIR, source.file);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.error(`Wrote ${outputPath} (${parsed.rows.length} rows)`);

  return {
    stage: source.stage,
    codeTable: source.codeTable,
    sourceUrl: source.url,
    file: source.file,
    rowCount: parsed.rows.length,
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const imported = [];
  for (const source of SOURCES) {
    imported.push(await importSource(source));
  }

  await writeFile(
    resolve(OUTPUT_DIR, "index.json"),
    `${JSON.stringify({ importedAt: new Date().toISOString(), sources: imported }, null, 2)}\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
