export type Dictionary = {
  common: {
    continue: string;
    back: string;
    next: string;
    previous: string;
    close: string;
    share: string;
    save: string;
    saved: string;
    start: string;
    explore: string;
    read: string;
    learnMore: string;
  };
  nav: {
    home: string;
    search: string;
    pathways: string;
    topics: string;
    answers: string;
    scriptures: string;
    objections: string;
    library: string;
    account: string;
  };
  pathways: {
    singular: string;
    plural: string;
    start: string;
    continue: string;
  };
  scripture: {
    related: string;
    supporting: string;
    key: string;
    mainPoint: string;
    whyItMatters: string;
    apostolicConnection: string;
    commonMisunderstanding: string;
    conversationUse: string;
    readInContext: string;
  };
  account: {
    settings: string;
    language: string;
    signIn: string;
    signOut: string;
    createAccount: string;
  };
  errors: {
    notFound: string;
    returnHome: string;
    unavailableInLanguage: string;
  };
};

export const en = {
  common: {
    continue: "Continue",
    back: "Back",
    next: "Next",
    previous: "Previous",
    close: "Close",
    share: "Share",
    save: "Save",
    saved: "Saved",
    start: "Start",
    explore: "Explore",
    read: "Read",
    learnMore: "Learn more",
  },
  nav: {
    home: "Home",
    search: "Search",
    pathways: "Pathways",
    topics: "Topics",
    answers: "Answers",
    scriptures: "Scriptures",
    objections: "Objections",
    library: "Library",
    account: "Account",
  },
  pathways: {
    singular: "Pathway",
    plural: "Pathways",
    start: "Start Pathway",
    continue: "Continue Pathway",
  },
  scripture: {
    related: "Related Scriptures",
    supporting: "Supporting Scriptures",
    key: "Key Scripture",
    mainPoint: "Main Point",
    whyItMatters: "Why It Matters",
    apostolicConnection: "Apostolic Connection",
    commonMisunderstanding: "Common Misunderstanding",
    conversationUse: "How to Use This Verse",
    readInContext: "Read in Context",
  },
  account: {
    settings: "Settings",
    language: "Language",
    signIn: "Sign In",
    signOut: "Sign Out",
    createAccount: "Create Account",
  },
  errors: {
    notFound: "We couldn't find that page.",
    returnHome: "Return home",
    unavailableInLanguage: "This content is not available in this language yet.",
  },
} as const satisfies Dictionary;
