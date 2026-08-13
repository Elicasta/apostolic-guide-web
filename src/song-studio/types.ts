export const SONG_TYPES = [
  "declaration",
  "adoration",
  "christology",
  "gospel",
  "response",
  "pentecost",
  "testimony",
  "consecration",
  "anthem",
  "hymn"
] as const;

export type SongType = (typeof SONG_TYPES)[number];

export const SONG_STATUSES = [
  "idea",
  "writing",
  "theology_review",
  "ready_for_suno",
  "in_production",
  "final",
  "distributed",
  "archived"
] as const;

export type SongStatus = (typeof SONG_STATUSES)[number];

export const SONG_SCORE_KEYS = [
  "doctrinal_fidelity",
  "scripture_grounding",
  "christ_centeredness",
  "oneness_integrity",
  "biblical_language",
  "congregational_singability",
  "hook_memorability",
  "lyrical_originality",
  "worship_orientation",
  "cliche_resistance",
  "structural_cohesion",
  "suno_readiness"
] as const;

export type SongScoreKey = (typeof SONG_SCORE_KEYS)[number];
export type SongScores = Record<SongScoreKey, number>;

export type SongGateStatus = "blocked" | "needs_work" | "ready_for_suno";

export type SongMechanics = {
  lineCount: number;
  sectionCount: number;
  chorusLineCount: number;
  averageWordsPerLine: number;
  longestLineWords: number;
  repeatedLineRatio: number;
  clicheHits: string[];
  jargonHits: string[];
  warnings: string[];
};

export type SongEvaluation = {
  id?: string;
  draft_id?: string;
  scores: SongScores;
  overall_score: number;
  gate_status: SongGateStatus;
  strengths: string[];
  issues: Array<{
    severity: "blocker" | "warning" | "note";
    category: SongScoreKey | "general";
    line?: string;
    note: string;
    suggested_direction?: string;
  }>;
  scripture_references: string[];
  theological_notes: string[];
  mechanics?: SongMechanics;
  model?: string | null;
  created_at?: string;
};

export type SongStyleProfile = {
  id: string;
  name: string;
  slug: string;
  description: string;
  musical_family: string;
  vocal_texture: string;
  instrumentation: string[];
  tempo_min: number | null;
  tempo_max: number | null;
  energy: number;
  congregation_fit: number;
  suno_style_prompt: string;
  negative_style_notes: string[];
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SongDraft = {
  id: string;
  project_id: string;
  version: number;
  title: string;
  lyrics: string;
  structure: Record<string, unknown>;
  notes: string;
  source: "human" | "ai" | "hybrid";
  ai_model: string | null;
  ai_response_id: string | null;
  ai_usage: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
  evaluation?: SongEvaluation | null;
};

export type SongProject = {
  id: string;
  title: string;
  working_title: string;
  status: SongStatus;
  song_type: SongType;
  theological_center: string;
  core_scriptures: string[];
  audience_context: string;
  desired_tone: string;
  creative_brief: string;
  style_profile_id: string | null;
  current_draft_id: string | null;
  suno_style_prompt: string;
  suno_production_notes: string;
  suno_negative_prompt: string;
  final_audio_url: string | null;
  final_video_url: string | null;
  cover_art_url: string | null;
  distribution_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  current_draft?: SongDraft | null;
};

export type SongAsset = {
  id: string;
  project_id: string;
  asset_type: "suno_audio" | "mix" | "master" | "cover" | "video" | "stems" | "other";
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_final: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SongGenerationRecord = {
  id: string;
  project_id: string;
  draft_id: string | null;
  generation_type: "write" | "refine" | "evaluate" | "suno_prompt";
  model: string;
  prompt_version: string;
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
  response_id: string | null;
  usage: Record<string, unknown>;
  created_at: string;
};
