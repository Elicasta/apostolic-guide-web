import type { CSSProperties } from 'react';
import type { CreativeFrame } from './creative-project';
import { carouselThemePalette, normalizeCarouselTheme } from './carousel-theme';
import { DESIGN_DIRECTIONS, STUDIO_FONTS, designColor, finite, publicHeading, resolveComposition, type StudioDesign } from './carousel-composition';

export type ArtworkInput = {
  frame: CreativeFrame; index: number; total: number; pathwayTitle: string; projectTitle: string;
  theme?: string; regenerationSeed?: number; design?: StudioDesign; height?: number;
  backgroundUrl?: string; brandAssets: { darkLogo: string; lightLogo: string };
};
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({display:'flex',position:'absolute',left,top,width,...(height === undefined ? {} : {height})});

/** Pure artwork tree. Both the browser preview and server PNG use Satori on this exact tree. */
export function CarouselArtwork(input: ArtworkInput) {
  const {frame, index, total, brandAssets} = input;
  const theme = normalizeCarouselTheme(input.theme);
  const direction = DESIGN_DIRECTIONS[theme];
  const d = input.design || {};
  const base = carouselThemePalette(theme);
  const c = {...base,bg:designColor(d.background,base.bg),accent:designColor(d.accent,base.accent)};
  const height = input.height || 1350;
  const light = theme === 'editorial-white' || theme === 'verse-connection';
  const composition = resolveComposition(frame,index,theme,input.regenerationSeed,d);
  const scripture = frame.role === 'scripture';
  const title = publicHeading(frame.headline || input.projectTitle);
  const body = frame.body || frame.overlayText || frame.supportingNotes;
  const cta = frame.cta && frame.cta !== body ? frame.cta : '';
  const dense = body.length > 420;
  const connection = composition === 'connection' && body.split(/\n\s*\n/).filter(Boolean).length === 2;
  const reading = scripture || composition === 'reading' || connection || dense;
  const split = composition === 'split' && !dense && !scripture;
  const inset = composition === 'inset';
  const margin = theme === 'editorial-white' ? 100 : 80;
  const left = split ? 126 : inset ? 130 : margin;
  const width = 1080-left-margin-(inset?50:0);
  const titleSize = finite((reading ? (scripture?35:78) : theme==='manifesto'?132:theme==='street-theology'?166:136) * Math.min(1,Math.sqrt(58/Math.max(1,title.length))) * finite(d.headlineScale,1,.55,1.45),80,28,156);
  const bodySize = finite((scripture?72:44)*Math.min(1,Math.sqrt(330/Math.max(1,body.length)))*finite(d.bodyScale,1,.65,1.35),44,34,76);
  const titleFont = STUDIO_FONTS.some(f=>f===d.headlineFont) ? d.headlineFont! : direction.titleFont;
  const bodyFont = STUDIO_FONTS.some(f=>f===d.bodyFont) ? d.bodyFont! : (scripture?'Cormorant Garamond':direction.bodyFont);
  const align = d.alignment || (composition === 'inset' ? 'center':'left');
  const gap = finite(d.copyGap,3,0.5,5)*10.8;
  const titleWidth = width*finite(d.titleWidth,100,48,100)/100;
  const bodyWidth = width*finite(d.bodyWidth,split?83:100,45,100)/100;
  // Conservative line estimates reserve a whole reading area, without truncating a single word.
  const estimatedTitle = Math.ceil(title.length*titleSize*(titleFont==='Bebas Neue'?.43:.54)/titleWidth)*titleSize*1.12;
  const estimatedBody = Math.ceil(body.length*bodySize*(bodyFont==='Cormorant Garamond'?.46:.55)/bodyWidth)*bodySize*1.3;
  const copyHeight = estimatedTitle+estimatedBody+(body?gap:0)+(cta?80:0)+65;
  const top = d.copyY ? Math.max(230,Math.min(height-200-copyHeight,height*d.copyY/100-copyHeight/2)) : connection ? 300 : reading ? Math.max(280,(height-copyHeight)/2) : composition==='closing' ? Math.max(270,height-350-copyHeight) : Math.max(275,(height-copyHeight)/2);
  const ink = designColor(d.headlineColor || d.textColor,c.fg);
  const bodyInk = designColor(d.bodyColor,c.fg);
  return <div style={{display:'flex',position:'relative',width:1080,height,backgroundColor:theme==='manifesto'&&composition==='statement'?c.accent:c.bg,color:c.fg,fontFamily:'Montserrat',overflow:'hidden'}}>
    {((theme==='cinematic'&&d.gradient!=='none')||d.gradient==='ambient') && <div style={{...abs(0,0,1080,height),backgroundImage:`radial-gradient(ellipse at ${composition==='split'?10:85}% 25%, #566b6e 0%, #142e3b 30%, #06131f 73%)`}}/>}
    {d.gradient==='wash' && <div style={{...abs(0,0,1080,height),backgroundImage:`linear-gradient(145deg, ${c.bg}, ${designColor(d.gradientColor,c.soft)})`}}/>}
    {input.backgroundUrl && <img src={input.backgroundUrl} alt="" width={1080} height={height} style={{...abs(0,0,1080,height),objectFit:'cover'}}/>}
    {input.backgroundUrl && <div style={{...abs(0,0,1080,height),backgroundColor:c.bg,opacity:finite(d.overlay,.7,0,1)}}/>}
    {theme==='street-theology' && <><div style={{...abs(790,reading?height-350:180,370,height),backgroundColor:c.accent,transform:'rotate(13deg)',opacity:.85}}/><div style={{...abs(810,reading?height-370:160,2,height),backgroundColor:c.fg,transform:'rotate(13deg)',opacity:.55}}/></>}
    {theme==='manifesto' && <><div style={{...abs(0,0,24,height),backgroundColor:c.accent}}/><div style={{...abs(760,190,270,270),border:`2px solid ${c.accent}`,borderRadius:135,opacity:.35}}/></>}
    {theme==='editorial-white' && <><div style={{...abs(52,52,976,height-104),border:'1px solid #d2cabc'}}/><div style={{...abs(78,210,920,1),backgroundColor:c.accent}}/></>}
    {theme==='verse-connection' && <><div style={{...abs(55,252,2,height-475),backgroundColor:c.accent,opacity:.4}}/>{[280,height-250].map(y=><div key={y} style={{...abs(48,y,16,16),border:`2px solid ${c.accent}`,borderRadius:8,backgroundColor:c.bg}}/>)}</>}
    {inset && <div style={{...abs(88,232,904,height-420),border:`1px solid ${light?'#c6c1b4':'#647178'}`,backgroundColor:light?'#fffdf6':c.bg,opacity:.3}}/>}
    {(d.texture !== 'none') && <div style={{...abs(0,0,1080,height),opacity:finite(d.textureStrength,16,0,70)/100,
      backgroundImage:d.texture==='light-leak-red'?`radial-gradient(ellipse at 0% 80%, ${c.accent}, transparent 60%)`:d.texture==='fog-soft'?'radial-gradient(ellipse at 80% 60%, #93adb3, transparent 65%)':undefined}}>
      {Array.from({length:d.texture==='grit-heavy'?180:90},(_,n)=>{
        const dot=['dust-speckle','ag-navy-speckle','grit-fine','grit-heavy','halftone'].includes(d.texture||'');
        return <div key={n} style={{...abs((n*137)%1080,(n*197)%height,dot?(n%3)+1:35+(n%11)*3,dot?2:1),backgroundColor:light?'#786a54':'#ffffff',opacity:dot?.65:.25,transform:dot?undefined:'rotate(-17deg)'}}/>;
      })}
    </div>}

    <div style={{...abs(margin,72,1080-margin*2,104),alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',flexDirection:'column',gap:10,maxWidth:730}}><span style={{fontSize:16,letterSpacing:4,fontWeight:800}}>APOSTOLIC GUIDE</span><span style={{fontSize:18,color:c.muted,lineHeight:1.3}}>{input.pathwayTitle}</span></div>
      <img src={light?brandAssets.lightLogo:brandAssets.darkLogo} alt="" width={100} height={86} style={{objectFit:'contain'}}/>
    </div>
    {split && <div style={{...abs(80,top+8,7,Math.min(600,copyHeight)),backgroundColor:c.accent}}/>}
    <div style={{...abs(left,top,width),flexDirection:'column',alignItems:align==='center'?'center':align==='right'?'flex-end':'flex-start',textAlign:align}}>
      {frame.scripture && !connection && <div style={{display:'flex',fontSize:18,letterSpacing:2,color:c.accent,fontWeight:800,marginBottom:30}}>{frame.scripture}{scripture?' · KJV':''}</div>}
      {title && title!==frame.scripture && <div data-copy-block="headline" style={{display:'flex',width:titleWidth,maxWidth:'100%',fontFamily:titleFont,fontSize:titleSize,lineHeight:1.08,fontWeight:finite(d.headlineWeight,titleFont==='Montserrat'?800:600,400,800),letterSpacing:finite(d.letterSpacing,titleFont==='Bebas Neue'?0:-1.5,-4,8),color:ink,whiteSpace:'pre-wrap',overflowWrap:'break-word'}}>{title}</div>}
      {body && !connection && <div data-copy-block="body" style={{display:'flex',width:bodyWidth,maxWidth:'100%',fontFamily:bodyFont,fontSize:bodySize,lineHeight:finite(d.lineHeight,scripture?1.22:1.45,1.05,1.8),fontWeight:finite(d.bodyWeight,bodyFont==='Cormorant Garamond'?600:400,400,800),marginTop:split?70:gap,alignSelf:split?'flex-end':undefined,paddingTop:split?30:0,borderTop:split?`1px solid ${c.accent}`:undefined,color:bodyInk,whiteSpace:'pre-wrap',overflowWrap:'break-word'}}>{body}</div>}
      {connection && <div style={{display:'flex',flexDirection:'column',width:'100%',marginTop:48,gap:28}}>
        {body.split(/\n\s*\n/).map((passage,n)=><div data-copy-block="passage" key={n} style={{display:'flex',flexDirection:'column',borderLeft:`3px solid ${c.accent}`,padding:'24px 30px',backgroundColor:light?'#fffdf6':'#ffffff09'}}>
          {frame.scripture.split(' · ')[n] && <span style={{fontSize:18,letterSpacing:2,color:c.accent,marginBottom:22}}>{frame.scripture.split(' · ')[n]}</span>}
          <span style={{fontFamily:'Cormorant Garamond',fontSize:Math.min(62,bodySize*1.3),lineHeight:1.2,whiteSpace:'pre-wrap'}}>{passage}</span>
        </div>)}
      </div>}
      {cta && <div data-copy-block="cta" style={{display:'flex',fontSize:25,lineHeight:1.35,marginTop:32,paddingTop:20,borderTop:`2px solid ${c.accent}`,color:ink}}>{cta}</div>}
    </div>
    <div style={{...abs(margin,height-115,1080-margin*2,55),borderTop:`1px solid ${light?'#b7b1a6':'#60707a'}`,paddingTop:24,justifyContent:'space-between',fontSize:15,letterSpacing:2,color:c.muted}}><span>APOSTOLICGUIDE.COM</span><span>{String(index+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span></div>
  </div>;
}
