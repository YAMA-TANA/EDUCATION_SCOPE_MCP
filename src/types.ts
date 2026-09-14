export type SchoolStage = "小学校" | "中学校" | "高等学校";

export type TargetScope =
  | "小1"
  | "小2"
  | "小3"
  | "小4"
  | "小5"
  | "小6"
  | "中1"
  | "中2"
  | "中3"
  | "高校まで";

export interface CurriculumSource {
  publisher: "文部科学省";
  url: string;
  note?: string;
}

export interface CurriculumItem {
  id: string;
  stage: SchoolStage;
  /** Conservative upper end of the grade range used by scope auditing. */
  grade?: number;
  /** All grades represented by the code when the curriculum item spans grades. */
  grades?: number[];
  subject: string;
  /** High-school course name when it can be inferred from the code-table hierarchy. */
  course?: string;
  domain: string;
  topic: string;
  aliases: string[];
  description: string;
  prerequisites: string[];
  curriculumCode?: string;
  codeTable?: string;
  itemNumber?: string;
  sectionPath?: string[];
  /** Structural rows are retained for browsing but can be excluded from text scoring. */
  searchable?: boolean;
  dataOrigin?: "seed" | "mext";
  source: CurriculumSource;
}

export interface ScoredCurriculumItem {
  item: CurriculumItem;
  score: number;
  matchedBy: string[];
}

export interface ScopeClassification {
  query: string;
  bestMatch: CurriculumItem | null;
  confidence: number;
  alternatives: Array<{
    item: CurriculumItem;
    confidence: number;
  }>;
  note?: string;
}

export interface ScopeAuditResult {
  target: TargetScope;
  targetRank: number;
  detected: CurriculumItem[];
  exceedsTarget: CurriculumItem[];
  withinTarget: boolean;
  unknownTextPresent: boolean;
  note: string;
}
