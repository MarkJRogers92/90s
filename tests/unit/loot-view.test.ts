import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { LootView } from '../../src/game/view/LootView';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { collectTokens } from '../../src/sim/run/tokens';
import { collectItemDrops, dropItemsForDeaths } from '../../src/sim/run/drops';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { presentationDepth } from '../../src/game/presentation/depth';
class Image {
  texture: { key: string }; x=0; y=0; scaleX=1; scaleY=1; alpha=1; depth=0; visible=true; destroyed=false;
  constructor(key: string) { this.texture={key}; }
  setTexture(key: string) { this.texture.key=key; return this; }
  setPosition(x:number,y:number) { this.x=x; this.y=y; return this; }
  setScale(x:number,y=x) { this.scaleX=x; this.scaleY=y; return this; }
  setAlpha(n:number) { this.alpha=n; return this; }
  setDepth(n:number) { this.depth=n; return this; }
  setOrigin() { return this; }
  setVisible(b:boolean) { this.visible=b; return this; }
  destroy() { this.destroyed=true; }
}
class Graphics { destroyed=false; setDepth() { return this; } clear() { return this; } fillStyle() { return this; } fillRect() { return this; } lineStyle() { return this; } strokeRect() { return this; } fillTriangle() { return this; } destroy(){this.destroyed=true;} }
function setup(missing=false) {
  const images:Image[]=[]; const graphics:Graphics[]=[];
  const clock={now:0}; const scene={time:clock,textures:{exists:(key:string)=>!(missing&&key.startsWith('neon:item:')),get:(key:string)=>({key})},add:{image:(_x:number,_y:number,key:string)=>{const img=new Image(key);images.push(img);return img;},graphics:()=>{const g=new Graphics();graphics.push(g);return g;}}} as unknown as Phaser.Scene;
  const view=new LootView(scene); const state=createMvpRun(3); state.room.combat.enemies=[]; state.room.combat.player.x=300;state.room.combat.player.y=260;
  const layers={shadow:()=>{},light:()=>{}};
  return {view,state,layers,images,graphics,clock};
}
const pickup={id:'cash',x:320,y:260,value:4,droppedTick:0};

describe('loot renderer lifecycle and success evidence',()=>{
  it('reuses sprites, updates moving pickup depth and does not mutate run data',()=>{
    const {view,state,layers,images}=setup();state.room.tokens=[pickup]; const before=JSON.stringify(state);
    view.sync(state,'one',layers,true);expect(JSON.stringify(state)).toBe(before);
    const sprite=images.find(i=>i.texture.key==='fx:mall-token')!;
    state.room.tokens=[{...pickup,y:280}];state.tick=1;view.sync(state,'one',layers,true);
    expect(images.filter(i=>i.texture.key==='fx:mall-token')).toHaveLength(1);
    expect(sprite.depth).toBe(presentationDepth('actor',279));expect(sprite.y).toBe(274);
  });
  it('never represents a missing item icon as currency',()=>{
    const {view,state,layers,images}=setup(true);state.room.tokens=[{...pickup,kind:'item',itemDefinitionId:'golden_mop',rare:true}];
    view.sync(state,'one',layers,true);expect(images.some(i=>i.texture.key==='fx:mall-token')).toBe(false);
    expect(images.some(i=>i.texture.key.startsWith('label:?|'))).toBe(true);
  });
  it('does not turn disappearance or room transition into a pickup receipt',()=>{
    const {view,state,layers,images}=setup();state.room.tokens=[pickup];view.sync(state,'one',layers,true);
    state.room.tokens=[];state.tick++;view.sync(state,'one',layers,true);
    expect(images.some(i=>i.texture.key.startsWith('label:+$'))).toBe(false);
    state.behaviorTrace.push('[t2] +4 Mall Tokens ($4).');state.tick++;view.sync(state,'two',layers,true);
    expect(images.some(i=>i.texture.key.startsWith('label:+$'))).toBe(false);
  });
  it('shows actual same-tick unseen cash collection once and freezes it while paused',()=>{
    const {view,state,layers,images}=setup();view.sync(state,'one',layers,true);
    state.room.tokens=[{...pickup,x:300}];state.tick++;collectTokens(state);view.sync(state,'one',layers,true);
    const receipt=images.find(i=>i.texture.key.startsWith('label:+$4|'))!;expect(receipt).toBeDefined();
    const count=images.length;state.paused=true;view.sync(state,'one',layers,true);expect(images.length).toBe(count);expect(receipt.visible).toBe(true);
    state.paused=false;state.tick+=100;view.sync(state,'one',layers,true);expect(receipt.visible).toBe(false);
  });
  it('consumes real item, snack and direct boss award messages',()=>{
    const {view,state,layers,images}=setup();view.sync(state,'one',layers,true);
    state.room.combat.player.health=1;state.room.tokens=[{...pickup,x:300,kind:'snack'}];state.tick++;collectTokens(state);view.sync(state,'one',layers,true);
    expect(images.some(i=>i.texture.key.startsWith('label:+HALF A HEART|'))).toBe(true);
    state.room.tokens=[{...pickup,x:300,kind:'item',itemDefinitionId:'pump_soaker'}];state.tick++;collectItemDrops(state);view.sync(state,'one',layers,true);
    state.tick+=100;view.sync(state,'one',layers,true);expect(images.some(i=>i.texture.key.includes('FOUND: PUMP-ACTION SOAKER'))).toBe(true);
    dropItemsForDeaths(state,[{id:99,kind:'lp_manager',x:700,y:400,health:1}]);state.tick+=1;view.sync(state,'one',layers,true);state.tick+=100;view.sync(state,'one',layers,true);
    expect(images.some(i=>i.texture.key.startsWith('label:RARE:'))).toBe(true);
  });
  it('cleans sprites and pending notices on reset, scope change, rewind and destroy',()=>{
    const {view,state,layers,images,graphics}=setup();state.room.tokens=[pickup];view.sync(state,'one',layers,true);const first=images[0]!;
    state.tick=2;view.sync(state,'two',layers,true);expect(first.destroyed).toBe(true);
    view.reset();expect(images.every(i=>i.destroyed)).toBe(true);
    view.sync(state,'two',layers,true);state.tick=1;view.sync(state,'two',layers,true);
    view.destroy();expect(images.every(i=>i.destroyed)).toBe(true);expect(graphics.every(g=>g.destroyed)).toBe(true);
  });
  it('shows full-health waiting text but never a receipt until health actually changes',()=>{
    const {view,state,layers,images}=setup();state.room.tokens=[{...pickup,x:350,kind:'snack'}];view.sync(state,'one',layers,true);
    expect(images.some(i=>i.texture.key.includes('PRETZEL - HEALTH FULL')&&i.visible)).toBe(true);
    state.room.combat.player.x=350;collectTokens(state);state.tick++;view.sync(state,'one',layers,true);
    expect(state.room.tokens).toHaveLength(1);expect(images.some(i=>i.texture.key.startsWith('label:+HALF'))).toBe(false);
  });
  it('bounds rapid receipts and shows a rare before excess common notices',()=>{
    const {view,state,layers,images}=setup();view.sync(state,'one',layers,true);
    for(let i=0;i<20;i++)state.behaviorTrace.push(`[t1] Found: Item ${i}.`);
    state.behaviorTrace.push('[t1] RARE FIND: Golden Mop.');state.tick++;view.sync(state,'one',layers,true);
    expect(images.some(i=>i.texture.key==='label:RARE: GOLDEN MOP|#ffd84a|1|#0a0610')).toBe(true);
    for(let i=0;i<8;i++){state.tick+=80;view.sync(state,'one',layers,true);}
    expect(images.filter(i=>i.visible&&!i.destroyed)).toHaveLength(0);
    expect(images).toHaveLength(1);
  });
  it('honors browser reduced motion without a new gameplay setting',()=>{
    vi.stubGlobal('window',{matchMedia:()=>({matches:true})});
    try {const {view,state,layers,images}=setup();state.tick=4;state.room.tokens=[pickup];view.sync(state,'one',layers);
      expect(images.find(i=>i.texture.key==='fx:mall-token')?.y).toBe(254);
    } finally {vi.unstubAllGlobals();}
  });
  it('keeps complete fixed-seed run traces identical with renderer active',()=>{
    for(const seed of [1,7,42]){
      const {view,layers}=setup();const observed=createMvpRun(seed);const control=createMvpRun(seed);
      view.sync(observed,'trace',layers,true);
      for(let tick=0;tick<240;tick++){
        if(tick%30===0)for(const state of [observed,control])state.room.tokens.push({id:`probe-${tick}`,kind:tick%60===0?'snack':'token',x:state.room.combat.player.x,y:state.room.combat.player.y,value:3,droppedTick:state.tick});
        const input={moveX:tick%90<45?1:-1,moveY:0,aimX:450,aimY:240,fire:tick%3===0,interact:false,steal:false,recall:false};
        tickMvpRun(observed,input);tickMvpRun(control,input);view.sync(observed,'trace',layers,tick%2===0);
        expect(JSON.stringify(observed)).toBe(JSON.stringify(control));
      }
      view.destroy();
    }
  });

  it('preempts older receipts with the winning boss rare and expires it on presentation time',()=>{
    const {view,state,layers,images,clock}=setup();view.sync(state,'one',layers,true);
    state.behaviorTrace.push('[t1] +4 Mall Tokens ($4).');state.tick=1;view.sync(state,'one',layers,true);
    state.behaviorTrace.push('[t2] RARE FIND: the boss dropped the Golden Mop!');state.tick=2;state.status='won';view.sync(state,'one',layers,true);
    expect(images.some(i=>i.visible&&i.texture.key.includes('RARE: GOLDEN MOP'))).toBe(true);
    clock.now=1500;view.sync(state,'one',layers,true);expect(images.filter(i=>i.visible&&!i.destroyed)).toHaveLength(0);
  });

  it('observes each fixed step before later combat logs evict unseen receipts',()=>{
    const {view,state,layers,images}=setup();view.sync(state,'one',layers,true);
    for(let tick=1;tick<=5;tick++){
      state.tick=tick;state.behaviorTrace.splice(0);state.behaviorTrace.push(`[t${tick}] +1 Mall Token ($1).`);view.observe(state,'one');
    }
    state.behaviorTrace.splice(0);view.sync(state,'one',layers,true);
    expect(images.some(i=>i.visible&&i.texture.key.startsWith('label:+$5|'))).toBe(true);
  });

  it('expires ordinary victory receipts too when a non-boss wave ends the wing',()=>{
    const {view,state,layers,images,clock}=setup();view.sync(state,'one',layers,true);
    state.behaviorTrace.push('[t1] +4 Mall Tokens ($4).');state.tick=1;state.status='won';view.sync(state,'one',layers,true);
    expect(images.some(i=>i.visible&&i.texture.key.startsWith('label:+$4|'))).toBe(true);
    clock.now=1500;view.sync(state,'one',layers,true);expect(images.filter(i=>i.visible&&!i.destroyed)).toHaveLength(0);
  });

});
