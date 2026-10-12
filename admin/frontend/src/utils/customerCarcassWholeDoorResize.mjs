/**
 * WISDOM G3-A: verified whole-opening door-aware resizing for manual carcasses.
 * Reuses the G1 tested shell planner. Only one coherent shell and an independently
 * verified single/pair door layout. No arbitrary scaling, drawers, per-bay doors,
 * unsupported hardware or assumptions about hidden/rotated parts.
 * This is geometry safety only, not joinery or load certification.
 */
import {
  getCustomerValidatedPanelCarcassSupport as getShellSupport,
  planCustomerValidatedPanelCarcassResize as planShell,
} from './customerValidatedPanelCarcassResize.mjs';

const EPS = 0.1;
const near = (a,b,t=EPS) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a)-Number(b))<=t;
const n=(p,k)=>Number(p[k]);
const err=(message='Whole-opening door connections are not verified for safe resizing.')=>({ok:false,error:message});
const r=x=>Math.round(x*1000)/1000;
const getId=p=>String(p?.id||'').trim();
const membership=p=>String(p?.groupId||p?.assemblyId||'').trim();
const role=p=>String(p?.partRole||p?.assemblyRole||'').trim().toLowerCase();
const isDoor=p=>String(p?.type||'').trim().toLowerCase()==='door_front_panel' && role(p)==='door';
const isShelf=p=>role(p)==='shelf' || String(p?.type||'').trim().toLowerCase()==='wr_shelf';
const safeNumber=(p,k)=> p[k]!=='' && p[k]!=null && Number.isFinite(Number(p[k]));
const untouchedMeta=(before,after)=>before.every((p,i)=> {
  const strip=q=>Object.fromEntries(Object.entries(q).filter(([key])=>!['x','y','z','width','height','depth','customerCarcassResizeBaseline'].includes(key)));
  return JSON.stringify(strip(p))===JSON.stringify(strip(after[i]));
});

function inspect(parts) {
  if(!Array.isArray(parts) || parts.length<5 || parts.length>82) return null;
  const doors=parts.filter(isDoor);
  if(doors.length!==1 && doors.length!==2) return null;
  const body=parts.filter(p=>!isDoor(p));
  if(body.length+doors.length!==parts.length) return null;
  const ids=new Set(), codes=new Set();
  for(const p of parts){
    if(!p || typeof p!=='object' || Array.isArray(p) || !getId(p) || ids.has(getId(p)) ||
      !String(p.partCode||'').trim() || codes.has(String(p.partCode).trim().toUpperCase()) ||
      !String(p.material||'').trim() || p.locked===true || p.visible===false ||
      Number(p.is_deleted||0)===1 || p.isReference===true || p.isHumanReference===true ||
      (p.groupId&&p.assemblyId&&String(p.groupId)!==String(p.assemblyId))) return null;
    ids.add(getId(p));codes.add(String(p.partCode).trim().toUpperCase());
  }
  const members=new Set(parts.map(membership));
  if(members.size!==1) return null;
  const sides=body.filter(p=>role(p)==='left_side_panel' || role(p)==='right_side_panel' ||
    (role(p)==='board_panel' && n(p,'width')<=50 && n(p,'height')>=400 && n(p,'depth')>=300));
  if(sides.length!==2) return null;
  const [left,right]=sides.sort((a,b)=>n(a,'x')-n(b,'x'));
  const thick=n(left,'width'), innerL=n(left,'x')+thick, innerR=n(right,'x');
  const frontZ=n(left,'z')+n(left,'depth');
  const top=body.find(p=>role(p)==='top_panel') || body.filter(p=>role(p)==='board_panel' && n(p,'height')<=50).sort((a,b)=>n(a,'y')-n(b,'y'))[0];
  const bottom=body.find(p=>role(p)==='bottom_panel') || body.filter(p=>role(p)==='board_panel' && n(p,'height')<=50).sort((a,b)=>n(b,'y')-n(a,'y'))[0];
  if(!top || !bottom || !Number.isFinite(frontZ)) return null;
  const cavityTop=n(top,'y')+n(top,'height');
  const cavityBottom=n(bottom,'y');
  // G1 requires shelves to reach the front; a door-safe shelf is shorter.
  // Validate the actual setback, then use a virtual flush shelf solely for
  // G1's construction reflow, restoring the original setback afterward.
  const setbacks=new Map();
  const virtualBody=body.map(p=>{
    if(!isShelf(p))return {...p};
    const setback=r(frontZ-(n(p,'z')+n(p,'depth')));
    if(!Number.isFinite(setback) || setback < -EPS || setback>130) return {...p};
    setbacks.set(getId(p),setback);
    return {...p,depth:r(n(p,'depth')+setback)};
  });
  const shell=getShellSupport(virtualBody);
  if(!shell.ok || !Number.isFinite(thick) || thick<=0 || cavityBottom-cavityTop<200) return null;
  const originals=[...doors].sort((a,b)=>n(a,'x')-n(b,'x'));
  const pair=originals.length===2;
  // Existing saved Admin Door Builder parts may have lost layout metadata
  // through normalizeComponent. Only the unambiguous whole-opening CAB-DOOR
  // code family may use this strictly geometric legacy recovery.
  const legacyCode = p => String(p.partCode || '').trim().toUpperCase();
  const knownWholeCodes = pair
    ? legacyCode(originals[0])==='CAB-DOOR-L' && legacyCode(originals[1])==='CAB-DOOR-R'
    : legacyCode(originals[0])==='CAB-DOOR';
  const mode=String(originals[0].doorLayoutMode || (knownWholeCodes?(pair?'pair':'single'):'')).trim().toLowerCase();
  if(!['single','pair','inset_pair'].includes(mode) || (pair && mode==='single') || (!pair && mode!=='single')) return null;
  if(originals.some(p=>String(p.doorLayoutScope || (knownWholeCodes?'whole':'')).trim().toLowerCase()!=='whole' ||
    String(p.doorLayoutMode || (knownWholeCodes?(pair?'pair':'single'):'')).trim().toLowerCase()!==mode ||
    (p.partFunction && !['auto','door'].includes(String(p.partFunction).toLowerCase())) ||
    (p.parentPartId && !body.some(b=>getId(b)===String(p.parentPartId))) ||
    (p.qty!=null && Number(p.qty)!==1) ||
    !['x','y','z','width','height','depth'].every(k=>safeNumber(p,k)) ||
    (p.doorReveal != null && !safeNumber(p,'doorReveal')) ||
    (p.doorGap != null && !safeNumber(p,'doorGap')) ||
    ['width','height','depth'].some(k=>n(p,k)<=0) ||
    !['rotationX','rotationY','rotationZ'].every(k=>near(n(p,k)||0,0)) ||
    (p.doorReveal != null && (n(p,'doorReveal')<0 || n(p,'doorReveal')>30)) ||
    (p.doorGap != null && (n(p,'doorGap')<0 || n(p,'doorGap')>25)) ||
    n(p,'depth')<6 || n(p,'depth')>40)) return null;
  const reveal=originals[0].doorReveal != null ? n(originals[0],'doorReveal') : r(n(originals[0],'x')-innerL);
  const gap=originals[0].doorGap != null ? n(originals[0],'doorGap') :
    pair ? r(n(originals[1],'x')-(n(originals[0],'x')+n(originals[0],'width'))) : 0;
  if(reveal<0 || reveal>30 || gap<0 || gap>25) return null;
  if(pair && (String(originals[0].doorLeaf || (knownWholeCodes?'left':'')).toLowerCase()!=='left' ||
    String(originals[1].doorLeaf || (knownWholeCodes?'right':'')).toLowerCase()!=='right')) return null;
  if(!pair && String(originals[0].doorLeaf || (knownWholeCodes?'single':'')).toLowerCase()!=='single')return null;
  if(originals.some(d=> (d.doorReveal != null && !near(n(d,'doorReveal'),reveal)) ||
    (d.doorGap != null && !near(n(d,'doorGap'),gap)) ||
    !near(n(d,'y'),n(originals[0],'y')) || !near(n(d,'z'),n(originals[0],'z')) ||
    !near(n(d,'height'),n(originals[0],'height')) || !near(n(d,'depth'),n(originals[0],'depth'))))return null;
  if(pair && (!near(n(originals[0],'width'),n(originals[1],'width')) ||
    !near(n(originals[0],'x')+n(originals[0],'width')+gap,n(originals[1],'x'))))return null;
  const doorLeft=originals[0];const doorRight=originals[originals.length-1];
  const openingL=innerL+reveal,openingR=innerR-reveal;
  // Up to 25 mm permitted for Admin grid snapping; larger misalignment is unsafe.
  if(!near(n(doorLeft,'x'),openingL,25) ||
    !near(n(doorRight,'x')+n(doorRight,'width'),openingR,25) ||
    !near(n(doorLeft,'y'),cavityTop+reveal,25) ||
    !near(n(doorLeft,'y')+n(doorLeft,'height'),cavityBottom-reveal,25) ||
    n(doorLeft,'y')+n(doorLeft,'height')>cavityBottom+EPS ||
    !near(n(doorLeft,'z')+n(doorLeft,'depth'),frontZ,25) ||
    n(doorLeft,'width')<100 || n(doorLeft,'height')<150 ||
    (pair && n(doorRight,'width')<100))return null;
  // A shelf must be fully behind the door face; no unverified intersection.
  for(const shelf of body.filter(isShelf)){
    if(n(shelf,'z')+n(shelf,'depth')>n(doorLeft,'z')-2+EPS)return null;
  }
  return {body,virtualBody,doors:originals,shell,setbacks,left,right,top,bottom,reveal,gap,
    frontZ,cavityTop,cavityBottom,innerL,innerR};
}

export function getCustomerCarcassWholeDoorSupport(parts=[]) {
  const shape=inspect(parts);
  if(!shape)return err();
  return {...shape.shell,validatedPanelCarcass:true,validatedCarcassDoors:true,
    doorCount:shape.doors.length,
    policy:'Whole-opening doors validated for clearance. Admin must verify hinges, joinery and structural strength.'};
}

export function planCustomerCarcassWholeDoorResize(parts=[],axis,targetMm) {
  const shape=inspect(parts);
  if(!shape)return err();
  if(!['width','height','depth'].includes(axis))return err('Unsupported dimension.');
  const wanted=Number(targetMm), before=shape.shell;
  const calculated=planShell(shape.virtualBody,axis,wanted);
  if(!calculated.ok)return calculated;
  const delta=wanted-before[axis];
  if(!delta)return {ok:true,parts:parts.map(p=>({...p})),[axis]:wanted,unchanged:true};
  const shellById=new Map(calculated.parts.map(p=>[getId(p),p]));
  const doorIds=new Set(shape.doors.map(getId));
  const firstDoor=shape.doors[0];
  const updated=parts.map(p=>{
    if(!doorIds.has(getId(p))){
      const shell=shellById.get(getId(p));
      if(!shell)return {...p};
      return shape.setbacks.has(getId(p))
        ? {...shell,depth:r(n(shell,'depth')-shape.setbacks.get(getId(p)))}
        : {...shell};
    }
    const next={...p};
    if(axis==='width'){
      if(shape.doors.length===1)next.width=r(n(p,'width')+delta);
      else {
        next.width=r(n(p,'width')+delta/2);
        if(p===shape.doors[1])next.x=r(n(p,'x')+delta/2);
      }
    } else if(axis==='height') {
      next.y=r(n(p,'y')-delta);
      next.height=r(n(p,'height')+delta);
    } else next.z=r(n(p,'z')+delta);
    return next;
  });
  const after=getCustomerCarcassWholeDoorSupport(updated);
  if(!after.ok || !near(after[axis],wanted) ||
    ['width','height','depth'].some(other=>other!==axis&&!near(after[other],before[other])) ||
    !untouchedMeta(parts,updated))return err('Resize would break door, shelf or carcass alignment.');
  return {ok:true,parts:updated,[axis]:wanted,policy:after.policy};
}
