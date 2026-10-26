import postcss from "postcss";
import { CODE_FONT_CSS, SOURCE_SERIF_EXTRA_CSS } from "./carousel-code-fonts";
import { ORIGINAL_CAROUSEL_CSS } from "./carousel-code-preset-css";
import {
  parseTree,
  findNodeAtLocation,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import type { CreativeFrame, CreativeEditorState } from "./creative-project";
export const CODE_SIZE = { width: 1080, height: 1350 };
export const CODE_TEMPLATE =
  '<div class="carousel-artwork"><div class="carousel-ambient carousel-ambient-red"></div><div class="carousel-ambient carousel-ambient-blue"></div><div class="carousel-grain"></div><div class="carousel-city"></div><img class="carousel-brand-mark" src="{{logo}}" alt=""><div class="carousel-pathway-label">SCRIPTURE PATHWAY</div><main class="carousel-copy"><span>{{eyebrow}}</span><strong data-fit>{{headline}}</strong><p>{{body}}</p><em>{{label}}</em></main><footer class="carousel-footer"><span>APOSTOLICGUIDE.COM</span><span>{{page}} / {{total}}</span></footer></div>';
export const CODE_FONTS =
  "https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&family=Inter:wght@400;600;800&family=Inter+Tight:wght@400;600;800&family=Source+Serif+Pro:ital,wght@0,400;0,600;0,700;0,900;1,400&display=swap";
export function presetCss(theme: string) {
  return `/* Original Carousel Studio · ${theme} · 1080 × 1350 */\n${ORIGINAL_CAROUSEL_CSS}`;
}
const overrideSchema = z.object({
  html: z.string().max(100000).default(""),
  css: z.string().max(100000).default(""),
  kicker: z.string().max(2000).optional(),
  quote: z.string().max(10000).optional(),
  label: z.string().max(2000).optional(),
  eyebrow: z.string().max(2000).optional(),
});
export const codeSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  preset: z.string().max(100),
  css: z.string().max(200000),
  template: z.string().max(100000).default(CODE_TEMPLATE),
  fitText: z.boolean().default(true),
  overrides: z.record(z.string(), overrideSchema).default({}),
  assets: z
    .array(
      z.object({
        name: z.string().max(180),
        url: z.string().max(4000),
        assetId: z.string().uuid().optional(),
        resolvedUrl: z.string().max(4000).optional(),
      }),
    )
    .max(100)
    .default([]),
});
export type CodeTheme = z.infer<typeof codeSchema>;
export function codeTheme(state: CreativeEditorState): CodeTheme | undefined {
  const parsed = codeSchema.safeParse(state.visualSettings.codeMode);
  return parsed.success ? parsed.data : undefined;
}
export function initialCodeTheme(theme: string): CodeTheme {
  return {
    version: 1,
    enabled: true,
    preset: theme,
    css: presetCss(theme),
    template: CODE_TEMPLATE,
    fitText: true,
    overrides: {},
    assets: [],
  };
}
export const BUILTIN_CODE_ASSETS = [
  { name: "Paper texture SVG", url: "/brand/carousel-paper.svg" },
  { name: "AG mark", url: "/brand/apostolic-guide-mark.png" },
  {
    name: "AG white/red mark",
    url: "/brand/apostolic-guide-mark-reversed.png",
  },
  { name: "Skyline SVG", url: "/brand/carousel-skyline.svg" },
];
export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export function cleanCodeHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "svg",
      "path",
      "g",
      "circle",
      "rect",
      "line",
      "polyline",
      "polygon",
      "ellipse",
      "defs",
      "linearGradient",
      "radialGradient",
      "stop",
      "clipPath",
      "text",
      "tspan",
      "br",
    ],
    allowedAttributes: {
      "*": [
        "id",
        "class",
        "style",
        "title",
        "aria-label",
        "data-fit",
        "data-fit-min",
        "data-overflow",
      ],
      img: ["src", "alt", "width", "height"],
      svg: ["viewBox", "width", "height", "xmlns", "fill"],
      path: ["d", "fill", "stroke", "stroke-width"],
      g: ["fill", "stroke", "transform", "clip-path"],
      circle: ["cx", "cy", "r", "fill", "stroke"],
      rect: ["x", "y", "width", "height", "rx", "fill"],
      line: ["x1", "x2", "y1", "y2", "stroke"],
      polyline: ["points", "fill", "stroke"],
      polygon: ["points", "fill", "stroke"],
      ellipse: ["cx", "cy", "rx", "ry", "fill"],
      linearGradient: ["id", "x1", "x2", "y1", "y2"],
      radialGradient: ["id", "cx", "cy", "r"],
      stop: ["offset", "stop-color", "stop-opacity"],
    },
    allowedSchemes: ["https", "data"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowProtocolRelative: false,
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowVulnerableTags: false,
  });
}
export function resolveCodeAssets(text: string, theme: CodeTheme) {
  let output = text;
  for (const asset of theme.assets) {
    if (asset.resolvedUrl)
      output = output.split(asset.url).join(asset.resolvedUrl);
  }
  return output;
}
export function frameMarkup(
  frame: CreativeFrame,
  index: number,
  total: number,
  theme: CodeTheme,
) {
  const o = theme.overrides[frame.id] || { html: "", css: "" };
  const light = ["editorial-white", "verse-connection"].includes(theme.preset);
  const fields: Record<string, string> = {
    kicker: o.kicker ?? frame.scripture,
    eyebrow: o.eyebrow ?? frame.scripture,
    headline: frame.headline,
    quote: o.quote ?? frame.body,
    body: frame.body,
    label: o.label ?? (frame.overlayText || frame.cta),
    page: String(index + 1).padStart(2, "0"),
    total: String(total).padStart(2, "0"),
    logo: light
      ? "/brand/apostolic-guide-mark.png"
      : "/brand/apostolic-guide-mark-reversed.png",
  };
  return cleanCodeHtml(
    resolveCodeAssets(o.html || theme.template, theme).replace(
      /\{\{(\w+)\}\}/g,
      (_, key: string) =>
        key === "headline"
          ? escapeHtml(fields[key] || "").replace(/&lt;br\s*\/?&gt;/gi, "<br>")
          : escapeHtml(fields[key] || ""),
    ),
  );
}
// This is the only executable code in a preview/export. User scripts never enter the document.
const HELPER = `(async()=>{
window.__codeReady=false;window.__codeResult=null;
await document.fonts.ready;
await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));
await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const slide=document.querySelector('.slide');
const bounds=slide.getBoundingClientRect();
const ignored=e=>e.closest('[data-overflow="ignore"],.carousel-ambient,.carousel-grain,.carousel-city') || e instanceof SVGElement;
const over=e=>{
 const s=getComputedStyle(e),r=e.getBoundingClientRect();
 if(s.display==='none'||!e.getClientRects().length||ignored(e))return false;
 const clips=v=>['hidden','clip','auto','scroll'].includes(v);
 const text=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
 const own=s.display!=='inline'&&text&&(e.scrollWidth>e.clientWidth+2||(clips(s.overflowY)&&e.scrollHeight>e.clientHeight+2));
 let clipped=false;
 for(let p=e.parentElement;p&&p!==slide;p=p.parentElement){
  const ps=getComputedStyle(p),pr=p.getBoundingClientRect();
  if((clips(ps.overflowX)&&(r.left<pr.left-2||r.right>pr.right+2))||(clips(ps.overflowY)&&(r.top<pr.top-2||r.bottom>pr.bottom+2))){clipped=true;break;}
 }
 return own||clipped||r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2;
};
if(FIT){for(const e of document.querySelectorAll('[data-fit]')){
 let size=parseFloat(getComputedStyle(e).fontSize);const min=Math.min(size,Math.max(12,Number(e.dataset.fitMin)||60));
 const clipped=()=>over(e)||[...e.parentElement.children].some(child=>over(child))||over(e.parentElement);
 while(size>min&&clipped()){size=Math.max(min,size-2);e.style.fontSize=size+'px';}
}}
const bad=[...document.querySelectorAll('.slide,.slide *')].filter(over);
window.__codeResult={overflow:bad.length>0,count:bad.length,elements:bad.map(e=>({tag:e.tagName,className:e.className,selector:e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'?e.className.trim().split(/\\s+/).filter(Boolean).map(c=>'.'+c).join(''):''),width:e.clientWidth,scrollWidth:e.scrollWidth,height:e.clientHeight,scrollHeight:e.scrollHeight})),fontsReady:true,resourceErrors:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src).concat([...document.fonts].filter(f=>f.status==='error').map(f=>f.family))};
parent.postMessage({type:'ag-code-check',channel:CHANNEL,...window.__codeResult},'*');window.__codeReady=true;
})();`;
export function codeCss(css: string) {
  const sheet = postcss.parse(css);
  const imports: string[] = [];
  sheet.walkAtRules("import", (rule) => {
    if (!/https:\/\/fonts\.googleapis\.com\//.test(rule.params))
      throw new Error("CSS @import only supports fonts.googleapis.com");
    imports.push(rule.toString());
    rule.remove();
  });
  return { imports: imports.join("\n"), css: sheet.toString() };
}
export function codeDocument(
  frame: CreativeFrame,
  index: number,
  total: number,
  theme: CodeTheme,
  origin: string,
  channel = "export",
) {
  const visual =
    (
      {
        "street-theology": "street",
        "editorial-white": "editorial",
        "verse-connection": "verse",
      } as Record<string, string>
    )[theme.preset] || theme.preset;
  const kind =
    frame.role === "hook"
      ? "cover"
      : frame.role === "support"
        ? "connection"
        : frame.role;
  const extra = theme.overrides[frame.id]?.css || "";
  const parsedCss = codeCss(resolveCodeAssets(theme.css + "\n" + extra, theme));
  const imports = parsedCss.imports.replace(/<\/style/gi, "<\\/style");
  const css = parsedCss.css.replace(/<\/style/gi, "<\\/style");
  const csp = `default-src 'none'; script-src 'nonce-ag-code-helper'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src ${origin} https://fonts.gstatic.com data:; img-src ${origin}/brand/ ${origin}/fonts/ https://*.supabase.co https://*.public.blob.vercel-storage.com https://*.private.blob.vercel-storage.com data:; connect-src 'none'; form-action 'none'; base-uri ${origin}; frame-src 'none'; object-src 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><base href="${escapeHtml(origin)}/"><link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous"><link rel="preload" href="/fonts/inter-tight-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous"><style>${imports}\nhtml,body{margin:0;padding:0;width:1080px;height:1350px;overflow:hidden}*{box-sizing:border-box}.slide{position:relative!important;width:1080px!important;height:1350px!important;max-width:none!important;margin:0!important;overflow:hidden;container-type:inline-size}${CODE_FONT_CSS}\n${SOURCE_SERIF_EXTRA_CSS}\n${css}\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}</style></head><body><div class="slide carousel-studio-page carousel-artboard is-${escapeHtml(visual)} is-${escapeHtml(kind)}">${frameMarkup(frame, index, total, theme)}</div><script nonce="ag-code-helper">(()=>{const FIT=${theme.fitText};const CHANNEL=${JSON.stringify(channel).replace(/</g, "\\u003c")};${HELPER}})();</script></body></html>`;
}
const frameSchema = z.object({
  id: z.string().min(1).max(100),
  order: z.number().int(),
  role: z.enum([
    "hook",
    "scripture",
    "explanation",
    "support",
    "statement",
    "cta",
  ]),
  headline: z.string().max(240),
  body: z.string().max(1400),
  scripture: z.string().max(180),
  overlayText: z.string().max(500),
  supportingNotes: z.string().max(1600),
  cta: z.string().max(500),
  pathwayLink: z.string().max(500),
  caption: z.string().max(2200),
  altText: z.string().max(1000),
  html: z.string().max(100000).default(""),
  css: z.string().max(100000).default(""),
  kicker: z.string().max(2000).optional(),
  quote: z.string().max(10000).optional(),
  label: z.string().max(2000).optional(),
  eyebrow: z.string().max(2000).optional(),
});
export const carouselJsonSchema = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(180),
    settings: z.record(z.string(), z.unknown()),
    theme: codeSchema,
    frames: z.array(frameSchema).min(1).max(20),
  })
  .superRefine((v, c) => {
    if (new Set(v.frames.map((f) => f.id)).size !== v.frames.length)
      c.addIssue({
        code: "custom",
        message: "Frame IDs must be unique",
        path: ["frames"],
      });
  });
export type CarouselCodeJson = z.infer<typeof carouselJsonSchema>;
export function toCodeJson(
  title: string,
  state: CreativeEditorState,
): CarouselCodeJson {
  const theme =
    codeTheme(state) ||
    initialCodeTheme(String(state.visualSettings.style || "editorial-white"));
  const settings = { ...state.visualSettings };
  delete settings.codeMode;
  return {
    version: 1,
    title,
    settings,
    theme,
    frames: state.frames.map((f) => ({
      ...f,
      ...(theme.overrides[f.id] || { html: "", css: "" }),
    })),
  };
}
export function fromCodeJson(value: unknown) {
  const data = carouselJsonSchema.parse(value);
  codeCss(data.theme.css);
  for (const frame of data.frames) codeCss(frame.css);
  const { codeMode: _ignored, ...settings } = data.settings;
  void _ignored;
  return {
    title: data.title,
    visualSettings: {
      ...settings,
      codeMode: {
        ...data.theme,
        enabled: true,
        overrides: Object.fromEntries(
          data.frames.map((f) => [
            f.id,
            {
              html: f.html,
              css: f.css,
              kicker: f.kicker,
              quote: f.quote,
              label: f.label,
              eyebrow: f.eyebrow,
            },
          ]),
        ),
      },
    },
    frames: data.frames.map(
      (
        {
          html: _h,
          css: _c,
          kicker: _k,
          quote: _q,
          label: _l,
          eyebrow: _e,
          ...f
        },
        index,
      ) => {
        void _h;
        void _c;
        void _k;
        void _q;
        void _l;
        void _e;
        return { ...f, order: index + 1 };
      },
    ),
  };
}
export function parseCodeJson(text: string) {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
  });
  if (errors.length) {
    const error = errors[0];
    const line = text.slice(0, error.offset).split("\n").length;
    throw new Error(`Line ${line}: ${printParseErrorCode(error.error)}`);
  }
  try {
    return fromCodeJson(JSON.parse(text));
  } catch (error) {
    const path = error instanceof z.ZodError ? error.issues[0]?.path : [];
    const node =
      tree && findNodeAtLocation(tree, (path || []) as (string | number)[]);
    const line = text.slice(0, node?.offset || 0).split("\n").length;
    throw new Error(
      `Line ${line}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
