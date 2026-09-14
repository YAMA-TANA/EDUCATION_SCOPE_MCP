import { curriculumById, curriculumItems, datasetStatus } from "./store.js";
import type {
  CurriculumItem,
  SchoolStage,
  ScopeAuditResult,
  ScopeClassification,
  ScoredCurriculumItem,
  TargetScope,
} from "./types.js";

const TARGET_RANK: Record<TargetScope, number> = {
  小1: 1,
  小2: 2,
  小3: 3,
  小4: 4,
  小5: 5,
  小6: 6,
  中1: 7,
  中2: 8,
  中3: 9,
  "高校まで": 10,
};

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[、。,.!?！？「」『』（）()\[\]{}]/g, "");
}

function stageRank(stage: SchoolStage, grade?: number): number {
  if (stage === "小学校") return Math.max(1, Math.min(6, grade ?? 6));
  if (stage === "中学校") return 6 + Math.max(1, Math.min(3, grade ?? 3));
  return 10;
}

export function scopeRank(item: CurriculumItem): number {
  return stageRank(item.stage, item.grade);
}

function termsFor(item: CurriculumItem): string[] {
  if (item.searchable === false) return [];
  return [item.topic, ...item.aliases];
}

function meaningfulTerm(term: string): boolean {
  const normalized = normalize(term);
  if (/^[a-z0-9^+=]+$/i.test(normalized)) return normalized.length >= 3;
  return normalized.length >= 2;
}

function scoreItem(query: string, item: CurriculumItem): ScoredCurriculumItem {
  const q = normalize(query);
  let score = 0;
  const matchedBy: string[] = [];

  for (const rawTerm of termsFor(item)) {
    const term = normalize(rawTerm);
    if (!term) continue;

    let termScore = 0;
    if (q === term) {
      termScore = 100;
    } else if (meaningfulTerm(rawTerm) && q.includes(term)) {
      termScore = 78 + Math.min(12, term.length);
    } else if (q.length >= 2 && term.includes(q)) {
      termScore = 64 + Math.min(10, q.length);
    }

    if (termScore > 0) {
      matchedBy.push(rawTerm);
      score = Math.max(score, termScore);
    }
  }

  const subject = normalize(item.subject);
  const domain = normalize(item.domain);
  if (q.includes(subject)) score += 4;
  if (q.includes(domain)) score += 3;

  return { item, score, matchedBy };
}

function compareScored(a: ScoredCurriculumItem, b: ScoredCurriculumItem): number {
  return (
    b.score - a.score ||
    scopeRank(a.item) - scopeRank(b.item) ||
    (a.item.dataOrigin === "mext" ? -1 : 1) -
      (b.item.dataOrigin === "mext" ? -1 : 1)
  );
}

export function classifyKnowledgeScope(
  query: string,
  limit = 5,
): ScopeClassification {
  const ranked = curriculumItems
    .map((item) => scoreItem(query, item))
    .filter((entry) => entry.score > 0)
    .sort(compareScored);

  if (ranked.length === 0) {
    return {
      query,
      bestMatch: null,
      confidence: 0,
      alternatives: [],
      note:
        datasetStatus.mode === "mext+seed"
          ? "文科省コード表の正規化データでも判定できませんでした。未登録・曖昧な概念を『範囲内』とはみなしません。"
          : "seedデータでは判定できません。npm run import:mext で文科省コード表を全量取り込みできます。",
    };
  }

  const best = ranked[0];
  const toConfidence = (score: number) => Math.min(1, Math.max(0.25, score / 100));

  return {
    query,
    bestMatch: best.item,
    confidence: toConfidence(best.score),
    alternatives: ranked.slice(1, limit).map((entry) => ({
      item: entry.item,
      confidence: toConfidence(entry.score),
    })),
  };
}

export interface SearchOptions {
  query?: string;
  stage?: SchoolStage;
  subject?: string;
  domain?: string;
  limit?: number;
}

export function searchCurriculum(options: SearchOptions): CurriculumItem[] {
  const query = options.query?.trim();
  const subject = options.subject ? normalize(options.subject) : undefined;
  const domain = options.domain ? normalize(options.domain) : undefined;

  let items = curriculumItems.filter((item) => {
    if (options.stage && item.stage !== options.stage) return false;
    if (subject && !normalize(item.subject).includes(subject)) return false;
    if (domain && !normalize(item.domain).includes(domain)) return false;
    return true;
  });

  if (query) {
    items = items
      .map((item) => scoreItem(query, item))
      .filter((entry) => entry.score > 0)
      .sort(compareScored)
      .map((entry) => entry.item);
  }

  return items.slice(0, Math.max(1, Math.min(options.limit ?? 20, 100)));
}

function semanticKey(item: CurriculumItem): string {
  return `${item.stage}|${item.grade ?? "*"}|${normalize(item.subject)}|${normalize(item.topic)}`;
}

function detectCurriculumItems(text: string): CurriculumItem[] {
  const normalizedText = normalize(text);
  const found = new Map<string, CurriculumItem>();

  for (const item of curriculumItems) {
    for (const rawTerm of termsFor(item)) {
      if (!meaningfulTerm(rawTerm)) continue;
      const term = normalize(rawTerm);
      if (normalizedText.includes(term)) {
        const key = semanticKey(item);
        if (!found.has(key)) found.set(key, item);
        break;
      }
    }
  }

  return [...found.values()].sort((a, b) => scopeRank(a) - scopeRank(b));
}

export function checkAnswerScope(
  answer: string,
  target: TargetScope,
): ScopeAuditResult {
  const detected = detectCurriculumItems(answer);
  const targetRank = TARGET_RANK[target];
  const exceedsTarget = detected.filter((item) => scopeRank(item) > targetRank);
  const unknownTextPresent = normalize(answer).length > 0 && detected.length === 0;

  return {
    target,
    targetRank,
    detected,
    exceedsTarget,
    withinTarget: exceedsTarget.length === 0 && !unknownTextPresent,
    unknownTextPresent,
    note: unknownTextPresent
      ? "既知概念を検出できなかったため、安全側に倒して未判定です。"
      : exceedsTarget.length > 0
        ? "対象学年より後で扱う概念を検出しました。"
        : datasetStatus.mode === "mext+seed"
          ? "文科省コード表＋seedで検出した範囲では対象学年内です。自由記述の完全な意味理解を保証するものではありません。"
          : "seedデータで検出した範囲では対象学年内です。npm run import:mext で全量データ化できます。",
  };
}

export interface PrerequisiteNode {
  item: CurriculumItem;
  prerequisites: PrerequisiteNode[];
}

function buildPrerequisiteNode(
  item: CurriculumItem,
  depth: number,
  seen: Set<string>,
): PrerequisiteNode {
  if (depth <= 0 || seen.has(item.id)) {
    return { item, prerequisites: [] };
  }

  const nextSeen = new Set(seen);
  nextSeen.add(item.id);

  return {
    item,
    prerequisites: item.prerequisites
      .map((id) => curriculumById.get(id))
      .filter((value): value is CurriculumItem => Boolean(value))
      .map((prerequisite) =>
        buildPrerequisiteNode(prerequisite, depth - 1, nextSeen),
      ),
  };
}

function findSeedPrerequisiteProxy(query: string, official: CurriculumItem): CurriculumItem | null {
  const ranked = curriculumItems
    .filter((item) => item.dataOrigin === "seed" && item.stage === official.stage)
    .map((item) => scoreItem(query, item))
    .filter((entry) => entry.score > 0)
    .sort(compareScored);
  return ranked[0]?.item ?? null;
}

export function getPrerequisites(
  topic: string,
  depth = 2,
): { matched: CurriculumItem | null; tree: PrerequisiteNode | null } {
  const classification = classifyKnowledgeScope(topic, 1);
  if (!classification.bestMatch) return { matched: null, tree: null };

  const root =
    classification.bestMatch.prerequisites.length > 0
      ? classification.bestMatch
      : findSeedPrerequisiteProxy(topic, classification.bestMatch) ?? classification.bestMatch;

  return {
    matched: classification.bestMatch,
    tree: buildPrerequisiteNode(
      root,
      Math.max(0, Math.min(depth, 5)),
      new Set(),
    ),
  };
}

export function listTargets(): Array<{ target: TargetScope; rank: number }> {
  return Object.entries(TARGET_RANK).map(([target, rank]) => ({
    target: target as TargetScope,
    rank,
  }));
}

export function getDatasetStatus() {
  return datasetStatus;
}
