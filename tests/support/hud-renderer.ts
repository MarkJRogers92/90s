import type Phaser from 'phaser';
import { measurePixelText } from '../../src/game/presentation/neon/pixelFont';
/** Records real HUD decisions; substitutes only Phaser's display/texture backend. */
export class HudImage {
  kind = 'image'; texture: {key:string}; x=0;y=0;width=32;height=32;scaleX=1;scaleY=1;rotation=0;alpha=1;visible=true;destroyed=false;originX=.5;originY=.5;tint=0xffffff;
  constructor(key:string){this.texture={key};this.setTexture(key);}
  setTexture(key:string){this.texture={key};
    if(key.startsWith('label:')){const [text,,size]=key.slice(6).split('|');this.width=measurePixelText(text??'')*Number(size)+2;this.height=7*Number(size)+2;}
    else if(key.startsWith('hud:heart')){this.width=this.height=16;}
    else if(key.includes('portrait')){this.width=this.height=128;}
    else {this.width=this.height=32;}return this;}
  setPosition(x:number,y:number){this.x=x;this.y=y;return this;} setVisible(v:boolean){this.visible=v;return this;}
  setOrigin(x:number,y=x){this.originX=x;this.originY=y;return this;} setAlpha(v:number){this.alpha=v;return this;}
  setScale(x:number,y=x){this.scaleX=x;this.scaleY=y;return this;} setDisplaySize(w:number,h:number){return this.setScale(w/this.width,h/this.height);}
  setRotation(v:number){this.rotation=v;return this;}setTint(v:number){this.tint=v;return this;}setBlendMode(){return this;}
  destroy(){this.destroyed=true;this.visible=false;}
}
export type Paint={type:string,args:number[],color:number,alpha:number,width:number};
export class HudGraphics {
  kind='graphics';visible=true;alpha=1;destroyed=false;commands:Paint[]=[];fill=0;fillAlpha=1;stroke=0;strokeAlpha=1;strokeWidth=1;
  clear(){this.commands=[];return this;} fillStyle(c:number,a=1){this.fill=c;this.fillAlpha=a;return this;}lineStyle(w:number,c:number,a=1){this.strokeWidth=w;this.stroke=c;this.strokeAlpha=a;return this;}
  fillRect(...args:number[]){this.commands.push({type:'fillRect',args,color:this.fill,alpha:this.fillAlpha,width:0});return this;}
  strokeRect(...args:number[]){this.commands.push({type:'strokeRect',args,color:this.stroke,alpha:this.strokeAlpha,width:this.strokeWidth});return this;}
  fillPoints(points:Array<{x:number,y:number}>){this.commands.push({type:'polygon',args:points.flatMap(p=>[p.x,p.y]),color:this.fill,alpha:this.fillAlpha,width:0});return this;}
  strokePoints(points:Array<{x:number,y:number}>){this.commands.push({type:'polygon',args:points.flatMap(p=>[p.x,p.y]),color:this.stroke,alpha:this.strokeAlpha,width:this.strokeWidth});return this;}
  destroy(){this.destroyed=true;this.visible=false;}
}
export class HudContainer {
  kind='container';x=0;y=0;alpha=1;visible=true;destroyed=false;children:Array<HudImage|HudGraphics|HudContainer>=[];
  add(c:HudImage|HudGraphics|HudContainer|Array<HudImage|HudGraphics|HudContainer>){this.children.push(...(Array.isArray(c)?c:[c]));return this;}
  setScrollFactor(){return this;}setDepth(){return this;}setAlpha(a:number){this.alpha=a;return this;}setVisible(v:boolean){this.visible=v;return this;}
  destroy(children=false){this.destroyed=true;this.visible=false;if(children)this.children.forEach(c=>c instanceof HudContainer?c.destroy(true):c.destroy());}
}
export function hudRenderer(){
 const images:HudImage[]=[],graphics:HudGraphics[]=[],containers:HudContainer[]=[];const missing=new Set<string>();const peek={isDown:false};
 const scene={textures:{exists:(k:string)=>!missing.has(k),get:(key:string)=>({key,getSourceImage:()=>({width:32,height:32})})},input:{keyboard:{addKey:()=>peek}},add:{
 image:(x:number,y:number,k:string)=>{const i=new HudImage(k).setPosition(x,y);images.push(i);return i;},
 graphics:()=>{const g=new HudGraphics();graphics.push(g);return g;},container:()=>{const c=new HudContainer();containers.push(c);return c;},
 }} as unknown as Phaser.Scene;
 const labels=()=>images.filter(i=>i.visible&&!i.destroyed&&i.texture.key.startsWith('label:'));
 const text=()=>labels().map(i=>i.texture.key.slice(6).split('|')[0]!);
 return {scene,images,graphics,containers,missing,peek,labels,text};
}
