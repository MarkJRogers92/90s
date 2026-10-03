import {describe,it,expect} from 'vitest';
import {fitHudText,hudDockLayout} from '../../src/game/ui/gameHudLayout';
import {buildGameHudModel} from '../../src/game/ui/gameHudModel';
import {createMvpRun} from '../../src/sim/run/createMvpRun';
import {measurePixelText} from '../../src/game/presentation/neon/pixelFont';
describe('bounded HUD layout',()=>{
 it('fits text at integer pixel scales without changing a fitting label',()=>{for(const width of [23,66,120,222,442])for(const text of ['','A','$123456789','ASSOCIATE-ISSUE MOP','A'.repeat(150)]){const fit=fitHudText(text,width);expect([1,2]).toContain(fit.scale);expect(measurePixelText(fit.text)*fit.scale+2).toBeLessThanOrEqual(width);if(measurePixelText(text)*2+2<=width)expect(fit).toEqual({text,scale:2});}});
 it('bounds arbitrary inventory counts and includes the selected weapon in its visible window',()=>{const base=buildGameHudModel(createMvpRun(7));for(const count of [0,1,3,4,9,10,14,100])for(const passives of [0,1,3,4,12,15,100])for(const selected of [0,Math.max(0,count-1)]){const model={weapons:Array.from({length:count},(_,i)=>({...base.weapons[0]!,slot:i+1,selected:i===selected})),passives:Array.from({length:passives},()=>({instanceId:'p',itemDefinitionId:'gel_pens',name:'GEL PENS',hot:false,fused:false}))};const layout=hudDockLayout(model);for(const c of [...layout.weapons,...layout.passives]){expect(c.x).toBeGreaterThanOrEqual(252);expect(c.x+c.w).toBeLessThanOrEqual(694);expect(c.y).toBeGreaterThanOrEqual(layout.equipment.y);expect(c.y+c.h).toBeLessThanOrEqual(588);}if(count>0)expect(layout.weapons.some(c=>c.index===selected)).toBe(true);expect(layout.passives.length+layout.passiveOverflow).toBe(passives);expect(layout.weapons.length).toBeLessThanOrEqual(9);}});
});
