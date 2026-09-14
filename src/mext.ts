import type { CurriculumItem, SchoolStage } from "./types.js";

export interface RawMextDataset {
  stage: SchoolStage;
  codeTable: string;
  sourceUrl: string;
  importedAt?: string;
  headers?: string[];
  rowCount?: number;
  rows: Array<Record<string, unknown>>;
}

export interface NormalizedMextSource {
  stage: SchoolStage;
  codeTable: string;
  sourceUrl: string;
  rawRowCount: number;
  normalizedItemCount: number;
}

export interface NormalizedMextDataset {
  schemaVersion: 1;
  generatedAt: string;
  sources: NormalizedMextSource[];
  itemCount: number;
  items: CurriculumItem[];
}

const STAGE_CODE: Record<SchoolStage, string> = {
  小学校: "2",
  中学校: "3",
  高等学校: "4",
};

const GENERIC_HEADINGS = new Set([
  "目標",
  "内容",
  "内容の取扱い",
  "指導計画の作成と内容の取扱い",
  "各学年の目標及び内容",
  "各科目",
  "総則",
  "各教科",
  "各教科等",
]);

function canonicalHeader(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/[\s　_＿・:：()（）［］\[\]]+/g, "")
    .toLowerCase();
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function rowLookup(row: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    map.set(canonicalHeader(key), stringValue(value));
  }
  return map;
}

function pick(row: Record<string, unknown>, aliases: string[]): string {
  const lookup = rowLookup(row);
  for (const alias of aliases) {
    const value = lookup.get(canonicalHeader(alias));
    if (value) return value;
  }
  return "";
}

function normalizeCode(value: string): string {
  return value.normalize("NFKC").replace(/[\s　-]+/g, "");
}

function findCurriculumCode(
  row: Record<string, unknown>,
  stage: SchoolStage,
): string | null {
  const direct = normalizeCode(
    pick(row, [
      "学習指導要領コード",
      "学習指導要領コード16桁",
      "学習指導要領コード（16桁）",
    ]),
  );

  const expectedStage = STAGE_CODE[stage];
  if (/^[0-9A-Za-z]{16}$/.test(direct) && direct[1] === expectedStage) {
    return direct;
  }

  for (const value of Object.values(row)) {
    const candidate = normalizeCode(stringValue(value));
    if (/^[0-9A-Za-z]{16}$/.test(candidate) && candidate[1] === expectedStage) {
      return candidate;
    }
  }

  return null;
}

function fullwidthDigitsToAscii(value: string): string {
  return value.replace(/[０-９]/g, (char) =>
    String(char.charCodeAt(0) - "０".charCodeAt(0)),
  );
}

export function stripSectionMarker(value: string): string {
  let text = fullwidthDigitsToAscii(value.normalize("NFKC"))
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\s　]+/g, " ")
    .trim();

  const patterns = [
    /^第\s*[0-9一二三四五六七八九十百]+\s*[章節款]\s*/,
    /^[0-9]+\s*[.．、]\s*/,
    /^[（(]\s*[0-9一二三四五六七八九十]+\s*[）)]\s*/,
    /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/,
    /^[ア-ン](?:\s+|[.．、]\s*)/,
    /^[A-ZＡ-Ｚ](?:\s+|[.．、]\s*)/,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of patterns) {
      const next = text.replace(pattern, "").trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }

  return text;
}

export function decodeGrades(
  stage: SchoolStage,
  code: string,
): number[] {
  const gradeCode = code[5] ?? "0";

  if (stage === "小学校") {
    if (/^[1-6]$/.test(gradeCode)) return [Number(gradeCode)];
    if (gradeCode === "A") return [1, 2];
    if (gradeCode === "C") return [3, 4];
    if (gradeCode === "D") return [5, 6];
    if (gradeCode === "L") return [3, 4, 5, 6];
    if (gradeCode === "0") return [1, 2, 3, 4, 5, 6];
    return [];
  }

  if (stage === "中学校") {
    if (/^[1-3]$/.test(gradeCode)) return [Number(gradeCode)];
    if (gradeCode === "A") return [1, 2];
    if (gradeCode === "B") return [2, 3];
    if (gradeCode === "0") return [1, 2, 3];
    return [];
  }

  // 高等学校の学習指導要領コードには原則として学年の概念がない。
  return [];
}

function fineDepth(code: string): number {
  return [...code.slice(7, 15)].filter((char) => char !== "0").length;
}

/**
 * Build possible structural parent codes by zeroing the fine-detail part from
 * right to left. This avoids scanning all curriculum rows for every item.
 */
function parentCodesFor(code: string, codeToText: Map<string, string>): string[] {
  if (code.length !== 16) return [];
  const parents = new Set<string>();

  for (let split = 14; split >= 7; split -= 1) {
    if (code[split] === "0") continue;

    const sameRevision = `${code.slice(0, split)}${"0".repeat(15 - split)}${code[15]}`;
    if (sameRevision !== code && codeToText.has(sameRevision)) {
      parents.add(sameRevision);
    }

    if (code[15] !== "0") {
      const baseRevision = `${code.slice(0, split)}${"0".repeat(15 - split)}0`;
      if (baseRevision !== code && codeToText.has(baseRevision)) {
        parents.add(baseRevision);
      }
    }
  }

  return [...parents].sort((a, b) => fineDepth(a) - fineDepth(b));
}

function isUsefulText(text: string): boolean {
  const clean = stripSectionMarker(text);
  if (clean.length < 2) return false;
  if (GENERIC_HEADINGS.has(clean)) return false;
  if (/^第?[0-9一二三四五六七八九十百]+$/.test(clean)) return false;
  return true;
}

function extractAliases(topic: string, rawText: string, path: string[]): string[] {
  const aliases = new Set<string>();

  const quotedPatterns = [/「([^」]{2,40})」/g, /『([^』]{2,40})』/g, /〔([^〕]{2,40})〕/g];
  for (const pattern of quotedPatterns) {
    for (const match of rawText.matchAll(pattern)) {
      const candidate = stripSectionMarker(match[1] ?? "");
      if (candidate.length >= 2 && candidate.length <= 40) aliases.add(candidate);
    }
  }

  for (const entry of path) {
    const candidate = stripSectionMarker(entry);
    if (
      candidate !== topic &&
      candidate.length >= 2 &&
      candidate.length <= 32 &&
      !GENERIC_HEADINGS.has(candidate)
    ) {
      aliases.add(candidate);
    }
  }

  return [...aliases].slice(0, 12);
}

function domainFromPath(path: string[], subject: string, course?: string): string {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const candidate = stripSectionMarker(path[index]);
    if (
      candidate.length >= 2 &&
      candidate.length <= 32 &&
      !GENERIC_HEADINGS.has(candidate) &&
      !/^第/.test(candidate)
    ) {
      return candidate;
    }
  }
  return course || subject || "区分なし";
}

function deriveCourseNames(
  rows: Array<Record<string, unknown>>,
  stage: SchoolStage,
): Map<string, string> {
  const candidates = new Map<string, Array<{ text: string; weight: number }>>();

  for (const row of rows) {
    const code = findCurriculumCode(row, stage);
    const rawText = pick(row, ["学習指導要領テキスト", "テキスト"]);
    if (!code || !rawText) continue;

    const prefix = code.slice(0, 4);
    const tail = code.slice(4, 15);
    const nonZero = [...tail].filter((char) => char !== "0").length;
    if (nonZero > 1) continue;

    const text = stripSectionMarker(rawText);
    if (!isUsefulText(text) || text.length > 40) continue;

    const weight = nonZero * 10 + text.length;
    const entries = candidates.get(prefix) ?? [];
    entries.push({ text, weight });
    candidates.set(prefix, entries);
  }

  const result = new Map<string, string>();
  for (const [prefix, entries] of candidates) {
    entries.sort((a, b) => a.weight - b.weight);
    if (entries[0]) result.set(prefix, entries[0].text);
  }
  return result;
}

export function normalizeMextSource(dataset: RawMextDataset): CurriculumItem[] {
  const codeToText = new Map<string, string>();
  const courseNames = deriveCourseNames(dataset.rows, dataset.stage);

  for (const row of dataset.rows) {
    const code = findCurriculumCode(row, dataset.stage);
    const text = pick(row, ["学習指導要領テキスト", "テキスト"]);
    if (!code || !text) continue;
    codeToText.set(code, text);
  }

  const items: CurriculumItem[] = [];
  let carriedSubject = "";

  for (let index = 0; index < dataset.rows.length; index += 1) {
    const row = dataset.rows[index];
    const code = findCurriculumCode(row, dataset.stage);
    const rawText = pick(row, ["学習指導要領テキスト", "テキスト"]);
    if (!code || !rawText) continue;

    const explicitSubject = pick(row, ["教科等", "教科", "教科・科目"]);
    if (explicitSubject) carriedSubject = explicitSubject;
    const subject = explicitSubject || carriedSubject || "区分なし";

    const topic = stripSectionMarker(rawText);
    if (!topic) continue;

    const sectionPath = [
      ...parentCodesFor(code, codeToText).map((parent) =>
        stripSectionMarker(codeToText.get(parent) ?? ""),
      ),
      topic,
    ].filter((value, pathIndex, all) => value && all.indexOf(value) === pathIndex);

    const grades = decodeGrades(dataset.stage, code);
    const course = dataset.stage === "高等学校" ? courseNames.get(code.slice(0, 4)) : undefined;
    const itemNumber = pick(row, ["No", "コード表No", "コード表 No", "項番"]);

    items.push({
      id: `mext-${dataset.codeTable.toLowerCase()}-${code}`,
      stage: dataset.stage,
      grade: grades.length > 0 ? Math.max(...grades) : undefined,
      grades: grades.length > 0 ? grades : undefined,
      subject: course && course !== subject ? `${subject} / ${course}` : subject,
      course,
      domain: domainFromPath(sectionPath, subject, course),
      topic,
      aliases: extractAliases(topic, rawText, sectionPath),
      description: rawText.replace(/[\r\n\t]+/g, " ").replace(/[\s　]+/g, " ").trim(),
      prerequisites: [],
      curriculumCode: code,
      codeTable: dataset.codeTable,
      itemNumber: itemNumber || String(index + 1),
      sectionPath,
      searchable: isUsefulText(rawText),
      dataOrigin: "mext",
      source: {
        publisher: "文部科学省",
        url: dataset.sourceUrl,
        note: `${dataset.codeTable} 学習指導要領コード表から自動正規化`,
      },
    });
  }

  // コード表内で同一コードが重複していても、MCP側には1件だけ出す。
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function normalizeMextDatasets(
  datasets: RawMextDataset[],
  generatedAt = new Date().toISOString(),
): NormalizedMextDataset {
  const sources: NormalizedMextSource[] = [];
  const items: CurriculumItem[] = [];

  for (const dataset of datasets) {
    const normalized = normalizeMextSource(dataset);
    items.push(...normalized);
    sources.push({
      stage: dataset.stage,
      codeTable: dataset.codeTable,
      sourceUrl: dataset.sourceUrl,
      rawRowCount: dataset.rows.length,
      normalizedItemCount: normalized.length,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt,
    sources,
    itemCount: items.length,
    items,
  };
}
