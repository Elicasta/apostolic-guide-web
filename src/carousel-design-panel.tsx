'use client';
import { CAROUSEL_TEXTURES } from './carousel-design-rules';
import { CAROUSEL_THEMES } from './carousel-theme';
import { COMPOSITIONS, DESIGN_DIRECTIONS, STUDIO_FONTS, type StudioDesign } from './carousel-composition';
import { CarouselPreview } from './carousel-preview';
import type { ArtworkInput } from './carousel-artwork';
import styles from './carousel-studio-v3.module.css';
export function CarouselDesignPanel({input,onTheme,onChange,onReset,onApplyTexture,onCustom}:{input:Omit<ArtworkInput,'brandAssets'>;onTheme:(theme:string)=>void;onChange:(patch:StudioDesign)=>void;onReset:()=>void;onApplyTexture:()=>void;onCustom?:()=>void}) {
 const d=input.design||{};
 const range=(label:string,key:keyof StudioDesign,min:number,max:number,step:number,fallback:number)=><label>{label}<span>{Number(d[key]??fallback).toFixed(step<1?2:0)}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={Number(d[key]??fallback)} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label>;
 return <section className={styles.inspector} aria-label="Slide styling">
  <div className={styles.sectionTitle}><h2>Art direction</h2><button type="button" onClick={onReset}>Reset slide</button></div>
  <div className={styles.themes}>{CAROUSEL_THEMES.map(t=><button key={t.id} type="button" aria-pressed={input.theme===t.id} onClick={()=>onTheme(t.id)}><CarouselPreview input={{...input,codeTheme:undefined,theme:t.id,design:{}}}/><strong>{t.label}</strong><small>{DESIGN_DIRECTIONS[t.id].label}</small></button>)}</div>
  {onCustom&&<button type="button" onClick={onCustom}>Custom Theme · Code Mode</button>}
  <label>Composition<select aria-label="Composition" value={d.layout||'automatic'} onChange={e=>onChange({layout:e.target.value as StudioDesign['layout']})}>{COMPOSITIONS.map(c=><option key={c} value={c}>{c==='automatic'?'Art-directed automatically':c[0].toUpperCase()+c.slice(1)}</option>)}</select></label>
  <button type="button" className={styles.regenerate} onClick={()=>onChange({layout:'automatic',variant:(d.variant||0)+1})}>Regenerate artwork</button>
  <p className={styles.hint}>Changes the composition. Your words stay intact.</p>
  <details open><summary>Typography & placement</summary><div className={styles.controlGrid}>
   <label>Headline font<select value={d.headlineFont||''} onChange={e=>onChange({headlineFont:e.target.value||undefined})}><option value="">Theme font</option>{STUDIO_FONTS.map(f=><option key={f}>{f}</option>)}</select></label>
   <label>Body font<select value={d.bodyFont||''} onChange={e=>onChange({bodyFont:e.target.value||undefined})}><option value="">Theme font</option>{STUDIO_FONTS.map(f=><option key={f}>{f}</option>)}</select></label>
   {range('Headline size','headlineScale',.55,1.45,.01,1)}{range('Body size','bodyScale',.65,1.35,.01,1)}
   <label>Headline weight<select disabled={(d.headlineFont||DESIGN_DIRECTIONS[input.theme as keyof typeof DESIGN_DIRECTIONS]?.titleFont)==='Bebas Neue'} value={d.headlineWeight||800} onChange={e=>onChange({headlineWeight:Number(e.target.value)})}><option value={400}>Regular</option><option value={800}>Bold</option></select></label>
   <label>Body weight<select disabled={d.bodyFont==='Bebas Neue'} value={d.bodyWeight||400} onChange={e=>onChange({bodyWeight:Number(e.target.value)})}><option value={400}>Regular</option><option value={800}>Bold</option></select></label>
   {range('Line height','lineHeight',1.05,1.8,.05,1.45)}{range('Letter spacing','letterSpacing',-4,8,.25,-1.5)}
   {range('Headline width','titleWidth',48,100,1,100)}{range('Body width','bodyWidth',45,100,1,100)}
   {range('Vertical position','copyY',32,68,1,50)}{range('Paragraph spacing','copyGap',.5,5,.1,3)}
   <label>Alignment<select value={d.alignment||''} onChange={e=>onChange({alignment:(e.target.value||undefined) as StudioDesign['alignment']})}><option value="">Automatic</option><option>left</option><option>center</option><option>right</option></select></label>
  </div></details>
  <details><summary>Color & surface</summary><div className={styles.controlGrid}>
   <label>Gradient<select value={d.gradient||(input.theme==='cinematic'?'ambient':'none')} onChange={e=>onChange({gradient:e.target.value as StudioDesign['gradient']})}><option value="none">Solid</option><option value="ambient">Ambient light</option><option value="wash">Color wash</option></select></label>
   <label>Gradient color<input type="color" value={d.gradientColor||'#253f50'} onChange={e=>onChange({gradientColor:e.target.value})}/></label>
   {(['headlineColor','bodyColor','background','accent'] as const).map(key=><label key={key}>{({headlineColor:'Headline color',bodyColor:'Body color',background:'Background',accent:'Accent'})[key]}<input aria-label={key} type="color" value={d[key]|| (key==='background'?'#102334':'#b52f43')} onChange={e=>onChange({[key]:e.target.value})}/><button type="button" onClick={()=>onChange({[key]:undefined})}>Use theme</button></label>)}
   <label>Texture<select value={d.texture||'paper-soft'} onChange={e=>onChange({texture:e.target.value})}>{CAROUSEL_TEXTURES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
   {range('Texture strength','textureStrength',0,70,1,12)}{range('Image overlay','overlay',0,1,.05,.7)}
  </div><button type="button" onClick={onApplyTexture}>Apply texture to every slide</button></details>
 </section>;
}
