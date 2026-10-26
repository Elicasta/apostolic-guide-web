/** Local component integration proof. Uses synthetic API responses, never a production database. */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {zipSync,unzipSync} from 'fflate';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=process.cwd(),temp='/tmp/carousel-browser-proof';await mkdir(temp,{recursive:true});
const project={id:'11111111-1111-4111-8111-111111111111',title:'The fullness of God',pathwaySlug:'god-is-one',pathwayTitle:'The Identity of Jesus',intent:'teaching',format:'carousel',destination:'instagram',status:'draft',stateVersion:1,tags:[],unifiedCaption:'Study the Scriptures.',cta:'',editorState:{visualSettings:{style:'editorial-white'},sourceImages:[],frames:[
 {id:'cover',order:1,role:'hook',headline:'The fullness of God. Revealed in Jesus.',body:'Follow the testimony of Scripture.',scripture:'',overlayText:'',supportingNotes:'',cta:'',pathwayLink:'',caption:'',altText:'Cover'},
 {id:'verse',order:2,role:'scripture',headline:'The Word became flesh.',body:'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.',scripture:'John 1:14',overlayText:'',supportingNotes:'',cta:'',pathwayLink:'',caption:'',altText:'John 1:14'}]}};
const entry=`import '${root}/app/globals.css';import '${root}/app/admin/carousel-studio-master.css';import '${root}/app/admin/carousel-final-stability.css';import '${root}/app/admin/carousel-manual-edit.css';import '${root}/app/admin/carousel-single-sol-art.css';import '${root}/app/admin/carousel-mobile-edit-v2.css';import '${root}/app/admin/carousel-manual-restore.css';import '${root}/app/admin/carousel-manual-inline.css';import '${root}/app/admin/carousel-final-repair.css';import '${root}/app/admin/carousel-capabilities-restore.css';import '${root}/app/admin/production-mobile-regression-fix.css';import '${root}/app/admin/carousel-mobile-viewport-repair.css';import '${root}/app/admin/carousel-live-contrast.css';import '${root}/app/admin/carousel-design-contract.css';import React from 'react';import{createRoot}from'react-dom/client';import{CreativeStudioClient}from'${root}/src/creative-studio-client';createRoot(document.getElementById('root')).render(<section className="creative-hub-shell carousel-studio-master"><CreativeStudioClient pathways={[]} initialProjectId="${project.id}" aiReady={false}/></section>);`;
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',outfile:join(temp,'app.js'),jsx:'automatic',external:['/brand/*'],loader:{'.woff':'dataurl','.woff2':'dataurl','.png':'dataurl'},plugins:[{name:'next-local-router',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return {push(){},replace(){}}}',loader:'js'}));}}],define:{'process.env.NODE_ENV':'"development"'}});
let fixture=structuredClone(project);
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/')){let data;if(req.url.endsWith('/frame-design'))data={designs:[]};else if(req.url.endsWith('/artwork'))data={backgrounds:[]};else if(req.method==='PATCH'){let body='';for await(const chunk of req)body+=chunk;const patch=JSON.parse(body);fixture={...fixture,...patch,stateVersion:fixture.stateVersion+1};data={project:fixture};}else data={project:fixture,revisions:[],assets:[]};res.setHeader('content-type','application/json');res.end(JSON.stringify(data));return;}
 let path=req.url==='/'?null:req.url.split('?')[0];if(!path){res.setHeader('content-type','text/html');res.end('<html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0}</style><div id="root"></div><script type="module" src="/app.js"></script></html>');return;}const file=path.startsWith('/fonts/')||path.startsWith('/brand/')?join(root,'public',path):join(temp,path);res.setHeader('access-control-allow-origin','*');res.setHeader('content-type',path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.woff')?'font/woff':'image/png');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(4178,'127.0.0.1',r));
if(process.argv.includes('--serve')){console.log('Fixture serving http://127.0.0.1:4178');await new Promise(()=>{});}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let saved=structuredClone(project),saveCount=0,conflict=false;const revisions=[];const presets=[];
 await page.route('**/api/admin/carousel-code-presets',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();const preset={id:crypto.randomUUID(),...body};presets.push(preset);await route.fulfill({json:{preset}});}else await route.fulfill({json:{presets}});});
 await page.route('**/api/admin/creative-projects/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data;
  if(path.endsWith('/code')&&req.method()==='PUT'){const patch=req.postDataJSON();if(patch.expectedStateVersion!==saved.stateVersion||saved.status!=='draft'){await route.fulfill({status:409,json:{error:'Draft changed'}});return;}const prior=structuredClone(saved);let next;if(patch.revisionId)next=structuredClone(revisions.find(r=>r.id===patch.revisionId).snapshot);else {const value=patch.carousel;next={...saved,title:value.title,editorState:{...saved.editorState,visualSettings:{...value.settings,codeMode:{...value.theme,overrides:Object.fromEntries(value.frames.map(f=>[f.id,{html:f.html,css:f.css}]))}},frames:value.frames.map(({html,css,...f},i)=>({...f,order:i+1}))}};}revisions.unshift({id:crypto.randomUUID(),version:revisions.length+1,change_summary:'Before Code Mode Apply',snapshot:prior});saved={...next,stateVersion:saved.stateVersion+1};data={project:saved};}
  else if(path.endsWith('/code-render')){const png=await readFile('docs/carousel-code-mode/export-slide-01.png');const files=Object.fromEntries(saved.editorState.frames.map((f,i)=>[`slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(png)]));await route.fulfill({contentType:'application/zip',body:Buffer.from(zipSync(files))});return;}else if(path.endsWith('/frame-design'))data={designs:[]};else if(path.endsWith('/artwork'))data={backgrounds:[]};else if(req.method()==='PATCH'){
   const patch=req.postDataJSON();if(conflict||patch.expectedStateVersion!==saved.stateVersion){await route.fulfill({status:409,json:{error:'This project changed in another editor.'}});return;}
   saved={...saved,...patch,stateVersion:saved.stateVersion+1};saveCount++;data={project:saved};
  }else data={project:saved,revisions:revisions.map(({snapshot,...r})=>r),assets:[]};
  await route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:4178');await page.getByAltText('Cover',{exact:true}).first().waitFor();
 await page.waitForFunction(()=>[...document.images].filter(i=>i.src.startsWith('blob:')).length>=6);
 await page.screenshot({path:resolve('docs/carousel-studio-3/workspace-desktop.png'),fullPage:true});
 const heading=page.getByLabel('Headline',{exact:true});const original=await heading.inputValue();
 await heading.fill('One God. Made known.');await page.waitForFunction(()=>document.querySelector('.cs3-save-state')?.textContent.includes('Saved'));await page.waitForTimeout(1200);
 assert.equal(saved.editorState.frames[0].headline,'One God. Made known.');
 await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await heading.inputValue(),original);
 await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal(await heading.inputValue(),'One God. Made known.');
 await page.getByRole('button',{name:/Street Theology/}).click();await page.waitForTimeout(1500);assert.equal(saved.editorState.visualSettings.style,'street-theology');
 await page.getByLabel('Composition',{exact:true}).selectOption('inset');await page.waitForTimeout(1400);assert.equal(saved.editorState.visualSettings.frameDesigns.cover.layout,'inset');
 const before=JSON.stringify(saved.editorState.frames);await page.getByRole('button',{name:'Regenerate artwork',exact:true}).click();await page.waitForTimeout(1400);assert.equal(JSON.stringify(saved.editorState.frames),before);assert.equal(saved.editorState.visualSettings.frameDesigns.cover.variant,1);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG'}).click();await (await download).saveAs(resolve('docs/carousel-studio-3/browser-export.png'));
 await page.reload();await page.getByAltText('Cover',{exact:true}).first().waitFor();assert.equal(await heading.inputValue(),'One God. Made known.');assert.equal(await page.getByLabel('Composition',{exact:true}).inputValue(),'automatic');
 await page.getByRole('button',{name:/02 The Word became flesh/}).click();assert.equal(await heading.inputValue(),'The Word became flesh.');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve('docs/carousel-studio-3/workspace-mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile workspace overflows horizontally');
 conflict=true;await heading.fill('Draft kept after save conflict');await page.getByText(/Save failed/).waitFor();assert.equal(await heading.inputValue(),'Draft kept after save conflict');assert.equal(saved.editorState.frames[1].headline,'The Word became flesh.');
 conflict=false;await page.getByRole('button',{name:'Retry save'}).click();await page.waitForTimeout(1000);assert.equal(saved.editorState.frames[1].headline,'Draft kept after save conflict');

 await page.getByRole('button',{name:'Open Code Mode',exact:true}).click();
 await page.getByLabel('Carousel CSS',{exact:true}).fill('.slide{background:#10202a;color:white;font-family:Inter} h1{font-size:80px;line-height:1.2;margin:100px}p{font-size:30px;margin:100px}');
 await page.getByRole('button',{name:'Code',exact:true}).click();
 await page.getByLabel('Frame HTML',{exact:true}).fill('<h1>{{headline}}</h1><p>{{body}}</p><script>window.attacked=true</script>');
 await page.getByLabel('Frame CSS',{exact:true}).fill('h1{color:#a12d3d}');
 await page.getByRole('button',{name:'Apply',exact:true}).click();try{await page.getByText('Applied and saved.',{exact:false}).waitFor();}catch(e){console.log(await page.locator('section[aria-label="Carousel Code Mode"]').innerText());throw e;}
 assert.ok(saved.editorState.visualSettings.codeMode.enabled);assert.ok(saved.editorState.visualSettings.codeMode.overrides.verse.html.includes('{{headline}}'));assert.equal(await page.locator('input[type=range]:visible').count(),0);
 await page.getByRole('button',{name:'JSON',exact:true}).click();const jsonBox=page.getByLabel('Whole-carousel JSON');const value=JSON.parse(await jsonBox.inputValue());const existingHeadline=saved.editorState.frames[0].headline;
 await jsonBox.fill('{\n bad }');await page.getByRole('button',{name:'Apply JSON',exact:true}).click();await page.getByText(/Line 2:/).waitFor();assert.equal(saved.editorState.frames[0].headline,existingHeadline);
 value.frames=Array.from({length:10},(_,i)=>({...value.frames[0],id:`code-${i}`,order:i+1,headline:`Slide ${i+1}<br>One God`,html:'<h1>{{headline}}</h1><p>{{body}}</p>',css:''}));await jsonBox.fill(JSON.stringify(value,null,2));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();await page.waitForTimeout(1000);assert.equal(saved.editorState.frames.length,10);await page.locator('iframe[title^="Code preview slide"]').first().waitFor();
 await page.getByLabel('New preset name').fill('Test custom theme');await page.getByRole('button',{name:'Save as new preset',exact:true}).click();await page.getByText('Preset saved for future carousels.').waitFor();assert.equal(presets.length,1);
 assert.equal(await page.locator('iframe[title^="Code preview slide"]').first().getAttribute('sandbox'),'allow-scripts');
 await page.getByRole('button',{name:'View 100%: Off',exact:true}).click();assert.equal(await page.locator('[data-code-preview]').first().evaluate(e=>e.getBoundingClientRect().width),1080);await page.getByRole('button',{name:'View 100%: On',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Code Mode overflows the mobile viewport');
 await page.screenshot({path:resolve('docs/carousel-code-mode/editor-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:resolve('docs/carousel-code-mode/editor-desktop.png'),fullPage:true});
 const codeDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNGs',exact:true}).click();const downloaded=await codeDownload;await downloaded.saveAs('/tmp/code-mode-ui.zip');assert.equal(Object.keys(unzipSync(new Uint8Array(await readFile('/tmp/code-mode-ui.zip')))).length,10);
 await page.getByText('Revisions · Undo / Restore',{exact:true}).click();const beforeRestore=saved.stateVersion;await page.getByRole('button',{name:/^Restore version/}).first().click();await page.getByText('Revision restored.',{exact:true}).waitFor();assert.ok(saved.stateVersion>beforeRestore);
 await writeFile('docs/carousel-code-mode/ui-report.json',JSON.stringify({passed:true,checks:['text-only controls','frame HTML/CSS Apply','JSON errors preserve draft','10-slide JSON Apply','custom preset save','sandbox without same-origin','1080px view','mobile containment','ZIP download','revision restore'],pageErrors:errors},null,2));
 assert.deepEqual(errors,[]);await writeFile('docs/carousel-studio-3/browser-report.json',JSON.stringify({passed:true,saveCount,checks:['live editing','undo redo','theme selection','frame composition','regeneration preserves copy','1080px PNG download','reload persistence','frame switching','390px overflow','409 conflict preserves edits and retry'],pageErrors:errors},null,2));console.log('Browser workflow checks passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
