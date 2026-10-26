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
  const badge = frame.cta || (frame.overlayText !== body ? frame.overlayText : '');
  const cta = badge && badge !== body && badge !== frame.scripture ? badge : '';
  const dense = body.length > 420;
  const connection = composition === 'connection' && body.split(/\n\s*\n/).filter(Boolean).length === 2;
  const reading = scripture || composition === 'reading' || connection || dense;
  const classic = true;
  const split = !classic && composition === 'split' && !dense && !scripture;

  const margin = theme === 'editorial-white' ? 97.2 : 86.4;
  const left = margin;
  const width = 1080-left-margin;
  // Original carousel-studio.css fit classes and carousel-studio-rules.css type scales.
  const fit = title.length > 90 ? 62.64 : title.length > 66 ? 74.52 : title.length > 44 ? 86.4 : title.length > 28 ? 101.52 : 115.56;
  const nativeTitle = theme === 'cinematic' ? 95.04 : theme === 'manifesto' ? 79.92 : theme === 'editorial-white' ? Math.min(fit,109.08) : fit;
  const titleSize = finite((scripture ? 35 : nativeTitle) * finite(d.headlineScale,1,.55,1.45),80,28,156);
  const bodySize = finite((scripture ? 54 : theme==='manifesto' ? 30.24 : theme==='cinematic' ? 25.38 : 26.46)*Math.min(1,Math.sqrt(650/Math.max(1,body.length)))*finite(d.bodyScale,1,.65,1.35),26.46,24,76);
  const titleFont = STUDIO_FONTS.some(f=>f===d.headlineFont) ? d.headlineFont! : direction.titleFont;
  const bodyFont = STUDIO_FONTS.some(f=>f===d.bodyFont) ? d.bodyFont! : (scripture||theme==='manifesto'?'Cormorant Garamond':'Montserrat');
  const align = d.alignment || 'center';
  const gap = finite(d.copyGap,2.3,0.5,5)*10.8;
  const titleWidth = width*finite(d.titleWidth,90,48,100)/100;
  const bodyWidth = width*finite(d.bodyWidth,reading?86:78,45,100)/100;
  // Conservative line estimates reserve a whole reading area, without truncating a single word.
  const estimatedTitle = Math.ceil(title.length*titleSize*(titleFont==='Bebas Neue'?.43:.54)/titleWidth)*titleSize*1.12;
  const estimatedBody = Math.ceil(body.length*bodySize*(bodyFont==='Cormorant Garamond'?.46:.55)/bodyWidth)*bodySize*1.3;
  const copyHeight = estimatedTitle+estimatedBody+(body?gap:0)+(cta?80:0)+65;
  const top = d.copyY ? Math.max(230,Math.min(height-200-copyHeight,height*d.copyY/100-copyHeight/2)) : connection ? 300 : reading ? Math.max(250,height*(composition==='inset'?.51:.48)-copyHeight/2) : Math.max(230,height*(composition==='statement'?.46:composition==='inset'?.51:.49)-copyHeight/2);
  const ink = designColor(d.headlineColor || d.textColor,c.fg);
  const bodyInk = designColor(d.bodyColor,light?'#263a44':'#dcebee');
  return <div style={{display:'flex',position:'relative',width:1080,height,backgroundColor:designColor(d.background,light?'#f5f7f4':'#10202a'),color:c.fg,fontFamily:'Montserrat',overflow:'hidden'}}>
    {((theme==='cinematic'&&d.gradient!=='none')||d.gradient==='ambient') && <div style={{...abs(0,0,1080,height),backgroundImage:`radial-gradient(ellipse at ${composition==='split'?10:85}% 25%, #566b6e 0%, #142e3b 30%, #06131f 73%)`}}/>}
    {!light && theme!=='cinematic' && d.gradient !== 'none' && <div style={{...abs(0,0,1080,height),backgroundImage:'linear-gradient(180deg, #10202a 0%, #0c1b24 62%, #08131a 100%)'}}/>}
    {!light && d.gradient !== 'none' && <div style={{...abs(0,0,1080,height),backgroundImage:'radial-gradient(ellipse at 100% 0%, #15566a30 0%, transparent 40%), radial-gradient(ellipse at 0% 100%, #a12d3d28 0%, transparent 36%)'}}/>}
    {d.gradient==='wash' && <div style={{...abs(0,0,1080,height),backgroundImage:`linear-gradient(145deg, ${c.bg}, ${designColor(d.gradientColor,c.soft)})`}}/>}
    {input.backgroundUrl && <img src={input.backgroundUrl} alt="" width={1080} height={height} style={{...abs(0,0,1080,height),objectFit:'cover'}}/>}
    {input.backgroundUrl && <div style={{...abs(0,0,1080,height),backgroundColor:c.bg,opacity:finite(d.overlay,.7,0,1)}}/>}
    {(d.texture !== 'none' && (!classic || Boolean(d.texture))) && <div style={{...abs(0,0,1080,height),opacity:finite(d.textureStrength,16,0,70)/100,
      backgroundImage:d.texture==='light-leak-red'?`radial-gradient(ellipse at 0% 80%, ${c.accent}, transparent 60%)`:d.texture==='fog-soft'?'radial-gradient(ellipse at 80% 60%, #93adb3, transparent 65%)':undefined}}>
      {Array.from({length:d.texture==='grit-heavy'?180:90},(_,n)=>{
        const dot=['dust-speckle','ag-navy-speckle','grit-fine','grit-heavy','halftone'].includes(d.texture||'');
        return <div key={n} style={{...abs((n*137)%1080,(n*197)%height,dot?(n%3)+1:35+(n%11)*3,dot?2:1),backgroundColor:light?'#786a54':'#ffffff',opacity:dot?.65:.25,transform:dot?undefined:'rotate(-17deg)'}}/>;
      })}
    </div>}

    {d.texture !== 'none' && <img alt="" width={1080} height={height} src={'data:image/svg+xml;base64,'+btoa('<svg width="180" height="180" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".86" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".7"/></svg>')} style={{...abs(0,0,1080,height),opacity:.025}}/>}
    {!light && theme!=='manifesto' && <svg width="1080" height={height*.16} viewBox="0 0 1000 100" style={{position:'absolute',left:0,bottom:0,opacity:theme==='cinematic'?.12:.18}}><path fill="#02070a" d="M0 35H70V9H130V28H200V43H280V18H340V34H430V7H480V45H560V23H630V41H720V17H780V33H870V3H920V37H1000V100H0Z"/></svg>}
    <span style={{...abs(70.2,height*.062,650),fontSize:13.176,letterSpacing:2.37,fontWeight:800,color:light?'#a12d3d':'#b9c6ca'}}>SCRIPTURE PATHWAY</span>
    <img src={light?brandAssets.lightLogo:brandAssets.darkLogo} alt="" width={106} height={86} style={{...abs(906,height*.052,106,86),objectFit:'contain'}}/>
    {split && <div style={{...abs(80,top+8,7,Math.min(600,copyHeight)),backgroundColor:c.accent}}/>}
    <div style={{...abs(left,top,width),flexDirection:'column',alignItems:align==='center'?'center':align==='right'?'flex-end':'flex-start',textAlign:align}}>
      {frame.scripture && !connection && <div style={{display:'flex',fontSize:16.74,letterSpacing:2.68,color:theme==='cinematic'||theme==='manifesto'?'#f1a5af':'#a12d3d',fontWeight:800,marginBottom:gap}}>{frame.scripture.toUpperCase()}{scripture?' · KJV':''}</div>}
      {title && title!==frame.scripture && <div data-copy-block="headline" style={{display:'flex',width:titleWidth,maxWidth:'100%',fontFamily:titleFont,fontSize:titleSize,lineHeight:theme==='manifesto'?1.02:theme==='street-theology'?.94:.98,fontWeight:finite(d.headlineWeight,titleFont==='Montserrat'?800:600,400,800),letterSpacing:finite(d.letterSpacing,theme==='editorial-white'?-2.8:-3.5,-4,8),color:ink,whiteSpace:'pre-wrap',overflowWrap:'break-word'}}>{!scripture ? title.toUpperCase() : title}</div>}
      {body && !connection && <div data-copy-block="body" style={{display:'flex',width:bodyWidth,maxWidth:'100%',fontFamily:bodyFont,fontSize:bodySize,lineHeight:finite(d.lineHeight,scripture?1.22:1.45,1.05,1.8),fontWeight:finite(d.bodyWeight,bodyFont==='Cormorant Garamond'?600:400,400,800),marginTop:split?70:gap,alignSelf:split?'flex-end':undefined,paddingTop:split?30:0,borderTop:split?`1px solid ${c.accent}`:undefined,color:bodyInk,whiteSpace:'pre-wrap',overflowWrap:'break-word'}}>{body}</div>}
      {connection && <div style={{display:'flex',flexDirection:'column',width:'100%',marginTop:48,gap:28}}>
        {body.split(/\n\s*\n/).map((passage,n)=><div data-copy-block="passage" key={n} style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 0'}}>
          {frame.scripture.split(' · ')[n] && <span style={{fontFamily:'Bebas Neue',fontSize:60,color:ink,marginBottom:22}}>{frame.scripture.split(' · ')[n]}</span>}
          <span style={{fontFamily:'Cormorant Garamond',fontSize:Math.min(62,bodySize*1.3),lineHeight:1.2,whiteSpace:'pre-wrap'}}>{passage}</span>
        </div>)}
      </div>}
      {cta && <div data-copy-block="cta" style={{display:'flex',fontSize:17.82,fontWeight:800,letterSpacing:1.78,lineHeight:1.2,marginTop:gap,padding:'11px 17px',backgroundColor:'#a12d3d',color:'#ffffff'}}>{cta}</div>}
    </div>
    <div style={{...abs(70.2,height*.948-16,939.6,20),justifyContent:'space-between',fontSize:14.58,fontWeight:800,letterSpacing:1.75,color:light?'#66777d':'#aebbc0'}}><span>APOSTOLICGUIDE.COM</span><span>{String(index+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span></div>
  </div>;
}
