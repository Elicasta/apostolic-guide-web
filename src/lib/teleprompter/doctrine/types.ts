export interface DoctrineVerse {
  reference: string;
  text: string;
}

export interface DoctrineReel {
  hook: string;
  clip: string;
  cta: string;
}

export interface DoctrineEpisode {
  number: number;
  title: string;
  batch: number;
  batchLabel: string;
  format: string;
  claim: string;
  objection: string;
  answer: string;
  pathway: string;
  recordingNote: string | null;
  verses: DoctrineVerse[];
  reels: DoctrineReel[];
}
