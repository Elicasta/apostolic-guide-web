# KJV source

`kjv.json` contains all 66 books from https://github.com/nolanbaxter/kjv-bible, retrieved October 6, 2026 at commit `5b6675c85615e1b9f5d6bf6ec955d6f2e8f4aaaa`. The source README identifies the KJV text as public domain in the United States. Book/chapter/verse keys and text are retained; only whitespace between JSON tokens is removed.

The public study renderer imports this data through a `server-only` component. It is not sent as a full corpus to the browser. `readKjvPassage` removes the source's square-bracket and red-letter-brace display markup while preserving words. Curly punctuation is normalized to match the site's existing KJV presentation. Editorial emphasis comes from the authored canonical pathway records, not automatic doctrinal interpretation.
