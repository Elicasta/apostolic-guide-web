import first from "./ekegusii-seeds/part-1.json";
import second from "./ekegusii-seeds/part-2.json";
import third from "./ekegusii-seeds/part-3.json";
import fourth from "./ekegusii-seeds/part-4.json";
import fifth from "./ekegusii-seeds/part-5.json";

export type EkegusiiSeedDraft = {
  title: string;
  summary: string;
  steps: Record<string, { title: string; explanation: string; hook: string }>;
};

/**
 * AI-generated Ekegusii drafts of the 20 Apostolic Guide Pathways.
 * Frozen from the English catalog on 2026-10-22.
 * Native-speaker and doctrinal review PENDING. These are not Bible quotations.
 */
export const ekegusiiSeedDrafts: Record<string, EkegusiiSeedDraft> = {
  ...first, ...second, ...third, ...fourth, ...fifth,
};
