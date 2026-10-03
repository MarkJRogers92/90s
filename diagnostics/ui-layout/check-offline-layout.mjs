/** Offline DOM/CSS verification only. No game, Vite or network navigation.
 * Uses real project markup/styles and a synthetic 960×600 stage to inspect
 * shell layout. Phaser FIT/CENTER_BOTH dimensions are reproduced explicitly;
 * runtime camera, gameplay and native fullscreen remain separate gates. */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] ?? 'artifacts/ui-layout-offline');
mkdirSync(output, { recursive: true });
let html = readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<img\b[^>]*>/g, '');
const css = readFileSync('src/styles.css', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true });
const results = [];
try {
 for (const [width, height, context] of [[1280,720,true],[1920,1080,false],[1920,1200,false],[3440,1440,false],[390,844,false],[390,844,true],[844,390,false]]) {
  const page = await browser.newPage({ viewport: { width,height }, deviceScaleFactor: 1 });
  await page.route('**/*',route=>route.abort());
  await page.setContent(html);
  await page.addStyleTag({ content: css });
  const result = await page.evaluate(({ context }) => {
   document.body.dataset.mode='run';
   document.querySelector('#start-screen').hidden=true;
   for (const id of ['run-shell','mvp-run-hud']) document.getElementById(id).hidden=false;
   document.getElementById('run-shell').dataset.mode='run';
   for (const id of ['run-hud','wing-hud','bench-hud']) document.getElementById(id).hidden=true;
   const offers=document.getElementById('mvp-run-offers-wrap');offers.hidden=!context;
   if(context) document.getElementById('mvp-run-offers').innerHTML='<li class="mvp-run-offer">Example item · $14</li>';
   const host=document.getElementById('game-host'),canvas=document.createElement('canvas');
   canvas.width=960;canvas.height=600;host.append(canvas);
   const box=host.getBoundingClientRect(),scale=Math.min(box.width/960,box.height/600);
   canvas.style.width=`${960*scale}px`;canvas.style.height=`${600*scale}px`;
   canvas.style.marginLeft=`${Math.floor((box.width-960*scale)/2)}px`;
   canvas.style.marginTop=`${Math.floor((box.height-600*scale)/2)}px`;
   const g=canvas.getContext('2d');g.fillStyle='#153442';g.fillRect(0,0,960,600);g.fillStyle='#244652';g.fillRect(0,0,960,120);
   g.strokeStyle='#527686';for(let x=0;x<=960;x+=80){g.beginPath();g.moveTo(x,120);g.lineTo(x,600);g.stroke();}for(let y=120;y<=600;y+=80){g.beginPath();g.moveTo(0,y);g.lineTo(960,y);g.stroke();}
   g.fillStyle='#eef8ff';g.font='24px monospace';g.textAlign='center';g.fillText('OFFLINE LAYOUT PROOF',480,265);g.font='18px monospace';g.fillText('Synthetic stage • not rendered gameplay',480,300);g.fillText('Fixed 960 × 600 / 16:10',480,330);
   g.fillStyle='#ffa0d4';g.fillRect(8,6,220,20);g.fillStyle='#82d9e3';g.fillRect(770,6,182,20);
   g.fillStyle='#100c18';g.font='12px monospace';g.fillText('OBJECTIVE SAFE AREA',118,21);g.fillText('MAP SAFE AREA',860,21);
   function rect(el){const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height};}
   return { viewport:{width:innerWidth,height:innerHeight},host:rect(host),canvas:rect(canvas),toolbar:rect(document.querySelector('.run-toolbar')),bodyWidth:document.body.scrollWidth,context };
  },{context});
  const c=result.canvas,h=result.host;
  if(Math.abs(c.x+c.width/2-h.x-h.width/2)>1 || Math.abs(c.y+c.height/2-h.y-h.height/2)>1) throw new Error(`Not centered: ${JSON.stringify(result)}`);
  if(c.x<h.x-1 || c.y<h.y-1 || c.x+c.width>h.x+h.width+1 || c.y+c.height>h.y+h.height+1)throw new Error(`Clipped: ${JSON.stringify(result)}`);
  if(result.bodyWidth>width)throw new Error(`Overflow: ${JSON.stringify(result)}`);
  await page.screenshot({ path:resolve(output,`offline-${width}x${height}${context?'-context':''}.png`) });
  results.push(result);
  await page.close();
 }
 writeFileSync(resolve(output,'geometry.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({ passed:results.length,output,scope:'offline DOM/CSS + synthetic stage; not runtime/fullscreen/input QA' }));
}finally{await browser.close();}
