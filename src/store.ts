import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { curriculumItems as seedItems } from "./data.js";
import type { NormalizedMextDataset } from "./mext.js";
import type { CurriculumItem } from "./types.js";

export interface CurriculumDatasetStatus {
  mode: "mext+seed" | "seed-only";
  normalizedPath: string | null;
  generatedAt: string | null;
  sourceTables: NormalizedMextDataset["sources"];
  mextItems: number;
  seedItems: number;
  totalItems: number;
  loadError?: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const normalizedCandidates = [
  resolve(moduleDir, "../../data/mext/normalized/curriculum-items.json"),
  resolve(moduleDir, "../data/mext/normalized/curriculum-items.json"),
  resolve(process.cwd(), "data/mext/normalized/curriculum-items.json"),
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isCurriculumItem(value: unknown): value is CurriculumItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CurriculumItem>;
  return (
    typeof item.id === "string" &&
    typeof item.stage === "string" &&
    typeof item.subject === "string" &&
    typeof item.domain === "string" &&
    typeof item.topic === "string" &&
    Array.isArray(item.aliases) &&
    Array.isArray(item.prerequisites) &&
    Boolean(item.source) &&
    typeof item.source?.url === "string"
  );
}

function loadNormalizedDataset(): {
  path: string | null;
  dataset: NormalizedMextDataset | null;
  error?: string;
} {
  const candidate = unique(normalizedCandidates).find((path) => existsSync(path));
  if (!candidate) return { path: null, dataset: null };

  try {
    const parsed = JSON.parse(readFileSync(candidate, "utf8")) as Partial<NormalizedMextDataset>;
    if (
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.items) ||
      !parsed.items.every(isCurriculumItem)
    ) {
      throw new Error("normalized curriculum file has an unsupported schema");
    }

    return {
      path: candidate,
      dataset: {
        schemaVersion: 1,
        generatedAt: parsed.generatedAt ?? "unknown",
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        itemCount: parsed.items.length,
        items: parsed.items,
      },
    };
  } catch (error) {
    return {
      path: candidate,
      dataset: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const loaded = loadNormalizedDataset();
const mextItems = loaded.dataset?.items ?? [];
const normalizedSeedItems: CurriculumItem[] = seedItems.map((item) => ({
  ...item,
  dataOrigin: "seed",
}));

/**
 * Official normalized MEXT rows are placed first so exact ties prefer the source
 * carrying a real curriculum code. Seed entries remain available for aliases and
 * prerequisite graphs.
 */
export const curriculumItems: CurriculumItem[] = [
  ...mextItems,
  ...normalizedSeedItems,
];

export const curriculumById = new Map(
  curriculumItems.map((item) => [item.id, item]),
);

export const datasetStatus: CurriculumDatasetStatus = {
  mode: loaded.dataset ? "mext+seed" : "seed-only",
  normalizedPath: loaded.path,
  generatedAt: loaded.dataset?.generatedAt ?? null,
  sourceTables: loaded.dataset?.sources ?? [],
  mextItems: mextItems.length,
  seedItems: normalizedSeedItems.length,
  totalItems: curriculumItems.length,
  ...(loaded.error ? { loadError: loaded.error } : {}),
};
