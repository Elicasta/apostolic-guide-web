export type CarouselVisualStyle = "street" | "editorial" | "cinematic" | "verse" | "manifesto";
export type CarouselMode = "pathway" | "informational" | "word-study" | "verse-connection" | "app-guide";

export const AG_CAROUSEL_COLORS = {
  paper: "#f5f7f4",
  white: "#ffffff",
  ink: "#10202a",
  ink2: "#263a44",
  muted: "#66777d",
  line: "#d9e1df",
  crimson: "#a12d3d",
  blue: "#15566a",
  blueSoft: "#dcebee"
} as const;

export type CarouselTextureId =
  | "none"
  | "ag-navy-paper"
  | "ag-paper-white"
  | "ag-navy-speckle"
  | "paper-soft"
  | "paper-fibrous"
  | "grit-fine"
  | "grit-heavy"
  | "concrete-soft"
  | "fog-soft"
  | "dust-speckle"
  | "halftone"
  | "newsprint"
  | "light-leak-red";

export type CarouselTexture = {
  id: CarouselTextureId;
  label: string;
  description: string;
  mood: string;
  bestFor: CarouselVisualStyle[];
  defaultStrength: number;
};

export const CAROUSEL_TEXTURES: CarouselTexture[] = [
  { id: "none", label: "None", description: "Clean flat surface.", mood: "clean", bestFor: ["editorial", "verse"], defaultStrength: 0 },
  { id: "ag-navy-paper", label: "AG Navy Paper", description: "The supplied Apostolic Guide navy paper texture. Tactile and even, with no distracting speckles.", mood: "brand", bestFor: ["street", "cinematic", "manifesto"], defaultStrength: 42 },
  { id: "ag-paper-white", label: "AG White Paper", description: "The supplied warm-white paper texture for teaching, word studies, and verse connections.", mood: "brand editorial", bestFor: ["editorial", "verse"], defaultStrength: 36 },
  { id: "ag-navy-speckle", label: "AG Navy Speckle", description: "The supplied navy texture with sparse bright flecks for stronger short-form statements.", mood: "brand grit", bestFor: ["street", "cinematic", "manifesto"], defaultStrength: 34 },
  { id: "paper-soft", label: "Paper Soft", description: "Subtle warm paper tooth without visible dirt.", mood: "editorial", bestFor: ["editorial", "verse", "manifesto"], defaultStrength: 24 },
  { id: "paper-fibrous", label: "Paper Fibrous", description: "Visible paper fibers for study-note tactility.", mood: "scholarly", bestFor: ["editorial", "verse"], defaultStrength: 30 },
  { id: "grit-fine", label: "Grit Fine", description: "Tight film-like grit that adds weight without obscuring type.", mood: "grounded", bestFor: ["street", "cinematic", "manifesto"], defaultStrength: 42 },
  { id: "grit-heavy", label: "Grit Heavy", description: "Rougher distressed surface reserved for short declarative slides.", mood: "raw", bestFor: ["street", "manifesto"], defaultStrength: 52 },
  { id: "concrete-soft", label: "Concrete Soft", description: "Low-frequency wall texture with restrained variation.", mood: "urban", bestFor: ["street", "cinematic"], defaultStrength: 34 },
  { id: "fog-soft", label: "Fog Soft", description: "Atmospheric haze for image-like cinematic depth.", mood: "reflective", bestFor: ["cinematic"], defaultStrength: 32 },
  { id: "dust-speckle", label: "Dust Speckle", description: "Sparse dust and age marks, never dense enough to compete with copy.", mood: "aged", bestFor: ["street", "manifesto", "cinematic"], defaultStrength: 28 },
  { id: "halftone", label: "Halftone", description: "Fine print dots for graphic teaching moments.", mood: "graphic", bestFor: ["street", "verse"], defaultStrength: 24 },
  { id: "newsprint", label: "Newsprint", description: "Paper-and-ink irregularity with a quiet editorial feel.", mood: "print", bestFor: ["editorial", "street"], defaultStrength: 26 },
  { id: "light-leak-red", label: "Crimson Light Leak", description: "A restrained crimson edge glow using the Apostolic Guide accent color.", mood: "dramatic", bestFor: ["cinematic", "street", "manifesto"], defaultStrength: 30 }
];

export const MODE_STYLE_DEFAULTS: Record<CarouselMode, CarouselVisualStyle> = {
  pathway: "street",
  informational: "editorial",
  "word-study": "editorial",
  "verse-connection": "verse",
  "app-guide": "editorial"
};

export const STYLE_TEXTURE_DEFAULTS: Record<CarouselVisualStyle, { texture: CarouselTextureId; strength: number }> = {
  street: { texture: "ag-navy-paper", strength: 42 },
  editorial: { texture: "ag-paper-white", strength: 34 },
  cinematic: { texture: "ag-navy-speckle", strength: 26 },
  verse: { texture: "ag-paper-white", strength: 32 },
  manifesto: { texture: "ag-navy-paper", strength: 36 }
};

export const CAROUSEL_GENERATOR_RULES = [
  "Every slide carries one idea. The design must carry the message rather than compete with it.",
  "Use no more than three text hierarchy levels: display headline, body/subhead, caption/label.",
  "Headlines should usually be 1–6 words. Put explanation in body copy instead of inflating the headline.",
  "Never depend on low contrast for softness. Text must be readable at a glance on a phone.",
  "Use a locked Apostolic Guide palette: ink #10202a, paper #f5f7f4, crimson #a12d3d, blue #15566a, blue-soft #dcebee. Crimson is an accent, not a background default.",
  "Use at most two font families per visual system.",
  "Do not use thin display weights for Scripture references or doctrinal claims. Reference typography must be at least 700 weight; major claims should usually be 700–800.",
  "Keep at least 5% frame margin and preserve consistent logo/footer placement across a set.",
  "Centered copy is only for short statements. Teaching copy and anything longer than two lines should favor a clear reading axis.",
  "Verse Connection slides are diagrams: reference A, a short relationship statement, connector, reference B. Do not bury the references in paragraph copy.",
  "Word Study slides favor brand-white editorial surfaces, dark ink, clear lexical labels, and left-aligned explanatory copy.",
  "Pathway slides favor Street Theology with strong contrast and one progression point per slide.",
  "Informational and App Guide slides favor editorial hierarchy and scanning clarity over dramatic poster styling.",
  "Slide 1 is the hook, middle slides teach one point at a time, and the last slide closes with one restrained next action.",
  "Carousels should reward attention with insight, clarity, and completion rather than sensational cliffhangers or visual overload.",
  "Use texture as atmosphere or structure only. Texture must never reduce text readability or become decorative noise."
] as const;
