export interface DoctrineTeachingFlow {
  /** The spoken opening should create the question that the first passage answers. */
  opening: string;
  /** One original, connected spoken explanation for each canonical verse card. */
  readings: string[];
  /** A spoken landing that returns to the episode's opening question. */
  conclusion: string;
}
