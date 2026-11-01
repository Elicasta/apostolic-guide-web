export type PathwayKjvVerse = {
  number: number;
  text: string;
};

export type PathwayKjvPassage = {
  reference: string;
  translation: "KJV";
  verses: PathwayKjvVerse[];
  emphasis: string[];
};
