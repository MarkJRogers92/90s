/* Optional development check, not a Forge runtime dependency.
 * node verify_quality_preview.cjs PREVIEW_HTML OUTPUT_DIR
 * FORGE_PLAYWRIGHT_MODULE may name an installed Playwright module.
 * FORGE_BROWSER_EXECUTABLE may name an existing Chromium executable.
 */
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require(process.env.FORGE_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const [preview,destination]=process.argv.slice(2);
 if(!preview||!destination)throw Error('usage: verify_quality_preview.cjs PREVIEW_HTML OUTPUT_DIR');
 const output=path.resolve(destination);fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,
  ...(process.env.FORGE_BROWSER_EXECUTABLE?{executablePath:process.env.FORGE_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-webgl']});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(preview)).href);
  await page.waitForFunction(()=>document.getElementById('info').textContent.includes('native'));
  const meta=JSON.parse(fs.readFileSync(path.join(path.dirname(preview),'atlas.json'),'utf8'));
  const expected=Object.keys(meta.frames);
  const samples=[];
  // Exercise every tag, including intentionally blank/held frames.
  const entries=Object.entries(meta.frames);
  const tags=meta.meta.frameTags;
  for(const tag of tags){
   await page.locator('#state').selectOption(tag.name);
   const cycle=entries.slice(tag.from,tag.to+1).reduce((n,[,e])=>n+e.duration,0);
   if(cycle>10000)throw Error('use a preview fixture with <=10 second cycle per state');
   for(let elapsed=0;elapsed<cycle+250;elapsed+=16){
    await page.waitForTimeout(16);samples.push(await page.locator('#info').textContent());
   }
  }
  await page.locator('#state').selectOption(tags[0].name);
  const seen=[...new Set(samples.map(s=>s.split(' | ')[0]))];
  if(expected.some(name=>!seen.includes(name)))throw Error('playback missed frames: '+JSON.stringify({expected,seen}));
  await page.locator('#pause').click();
  const paused=await page.locator('#info').textContent();await page.waitForTimeout(160);
  if(paused!==await page.locator('#info').textContent())throw Error('pause did not stop playback');
  await page.locator('#next').click();const next=await page.locator('#info').textContent();
  if(tags[0].to>tags[0].from && next===paused)throw Error('Next did not advance');
  await page.locator('#prev').click();
  if(paused!==await page.locator('#info').textContent())throw Error('Previous did not restore frame');
  await page.locator('#bg').fill('#14121c');
  const color=await page.locator('#c').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,1,1).data));
  if(JSON.stringify(color)!=='[20,18,28,255]')throw Error('background control did not redraw');
  const scales={};
  for(const scale of ['1','2','4']){
   await page.locator('#scale').selectOption(scale);
   scales[scale]=await page.locator('#c').evaluate(c=>[c.width,c.height]);
   await page.screenshot({path:path.join(output,`playback-${scale}x.png`)});
  }
  for(const scale of [2,4]){
   if(scales[String(scale)].some((n,i)=>n!==scales['1'][i]*scale))throw Error('incorrect native scale');
  }
  if(errors.length)throw Error(JSON.stringify(errors));
  const result={errors,frames_seen:seen,scales,pause:true,next:true,previous:true,background_rgba:color,samples};
  fs.writeFileSync(path.join(output,'browser-check.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({errors,frames_seen:seen.length,scales,controls:'pass'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
