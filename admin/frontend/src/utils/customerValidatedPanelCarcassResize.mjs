// WISDOM G1 — reusable, fail-closed resizing of recognizable axis-aligned
// panel carcasses, not an unrestricted mesh scaler or fabrication certification.
// Supports one structurally connected carcass (2 sides, top, bottom, optional
// back, toe/plinth, dividers and shelves). Unverified doors/drawers fail closed.
const T = 0.08;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= T;
const n = (p, k) => Number(p[k]);
const role = (p) => String(p?.partRole || p?.assemblyRole || '').toLowerCase().trim();
const type = (p) => String(p?.type || '').toLowerCase().trim();
const error = (message = 'This panel construction is not verified for safe resizing.') => ({ok:false,error:message});
const rounded = x => Math.round(x * 1000) / 1000;
const isGenericPanel = p => /^(furniture_board_panel|wr_side_panel|wr_top_panel|wr_bottom_panel|wr_back_panel|wr_shelf|wr_divider|wardrobe_plinth|cabinet_toe_kick)$/.test(type(p));
const hasRole = (p, name) => role(p) === name;
const allClose = (part, expected) => Object.entries(expected).every(([k,v]) => close(n(part,k),v));
const fixedFields = new Set(['x','y','z','width','height','depth','customerCarcassResizeBaseline']);
const noForbiddenChange = (before, after) => before.every((p,i) => {
  const oldCopy = Object.fromEntries(Object.entries(p).filter(([k]) => !fixedFields.has(k)));
  const newCopy = Object.fromEntries(Object.entries(after[i]).filter(([k]) => !fixedFields.has(k)));
  return JSON.stringify(oldCopy) === JSON.stringify(newCopy);
});

function inspect(parts) {
  if (!Array.isArray(parts) || parts.length < 4 || parts.length > 80) return null;
  const ids = new Set();
  const assemblies = new Set();
  for(const p of parts) {
    if(!p || typeof p !== 'object' || Array.isArray(p) || !p.id || ids.has(String(p.id)) ||
      p.locked === true || p.visible === false || Number(p.is_deleted || 0) === 1 ||
      p.isReference === true || p.isHumanReference === true ||
      !isGenericPanel(p) || !String(p.material || '').trim() || !["x","y","z","width","height","depth"].every(k => Number.isFinite(n(p,k)) && (!['width','height','depth'].includes(k) || n(p,k) > 0)) ||
      !['rotationX','rotationY','rotationZ'].every(k => close(Number(p[k] || 0),0)) ||
      (p.qty != null && Number(p.qty) !== 1) ||
      (p.partFunction && !['auto','normal'].includes(String(p.partFunction).toLowerCase())) ||
      String(p.motionGroupId || p.motionReferencePartId || '').trim() ||
      /door|drawer|hardware|handle|hinge|rail|rod/.test(`${role(p)} ${type(p)} ${p.label || ''}`.toLowerCase())) return null;
    ids.add(String(p.id));
    const g = String(p.groupId || p.assemblyId || '').trim();
    if (p.groupId && p.assemblyId && p.groupId !== p.assemblyId) return null;
    assemblies.add(g);
  }
  // One connected assembly or a manually built, entirely ungrouped box.
  if (assemblies.size !== 1) return null;
  const sides = parts.filter(p => hasRole(p,'left_side_panel') || hasRole(p,'right_side_panel') ||
    (role(p) === 'board_panel' && n(p,'width') <= 50 && n(p,'height') >= 400 && n(p,'depth') >= 300));
  if (sides.length !== 2) return null;
  const [left,right] = [...sides].sort((a,b) => a.x - b.x);
  if (left.id === right.id || (role(left) && role(left) !== 'board_panel' && role(left) !== 'left_side_panel') ||
      (role(right) && role(right) !== 'board_panel' && role(right) !== 'right_side_panel')) return null;
  const x = n(left,'x'), y = n(left,'y'), z = n(left,'z');
  const thick = n(left,'width'), height = n(left,'height'), depth = n(left,'depth');
  const width = n(right,'x') + n(right,'width') - x;
  if (!close(n(right,'width'),thick) || !close(n(right,'y'),y) || !close(n(right,'z'),z) ||
      !close(n(right,'height'),height) || !close(n(right,'depth'),depth) ||
      thick < 10 || thick > 50 || width < 420 || height < 450 || depth < 300 ||
      width > 2400 || height > 2600 || depth > 1000 || width - thick*2 < 350) return null;
  const innerX = x + thick, innerRight = x + width - thick, innerW = innerRight - innerX;
  const remaining = parts.filter(p => p !== left && p !== right);
  // A top may be fitted between both sides, or overlap them as a cap.
  const candidatesTop = remaining.filter(p => (hasRole(p,'top_panel') || role(p)==='board_panel') &&
    n(p,'height') >= 10 && n(p,'height') <= 50 && close(n(p,'z'),z) && close(n(p,'depth'),depth) &&
    ((close(n(p,'x'),innerX) && close(n(p,'width'),innerW) && close(n(p,'y'),y)) ||
     (close(n(p,'x'),x) && close(n(p,'width'),width) && close(n(p,'y')+n(p,'height'),y))));
  if (candidatesTop.length !== 1) return null;
  const top = candidatesTop[0], topThickness=n(top,'height');
  const cap = close(n(top,'x'),x);
  const cavityTop = n(top,'y') + topThickness;
  const bottomCandidates = remaining.filter(p => p!==top && (hasRole(p,'bottom_panel') || role(p)==='board_panel') &&
    n(p,'height') >= 10 && n(p,'height') <= 50 && close(n(p,'x'),innerX) &&
    close(n(p,'width'),innerW) && close(n(p,'z'),z) && close(n(p,'depth'),depth) &&
    n(p,'y') > cavityTop + 350 &&
    n(p,'y') + n(p,'height') <= y + height + T &&
    n(p,'y') >= y + height * 0.72);
  if (bottomCandidates.length !== 1) return null;
  const bottom = bottomCandidates[0], bottomY = n(bottom,'y');
  const cavityHeight=bottomY-cavityTop;
  if(cavityHeight < 350) return null;

  const classified = new Set([left.id,right.id,top.id,bottom.id]);
  const backCandidates = remaining.filter(p => !classified.has(p.id) && hasRole(p,'back_panel'));
  if(backCandidates.length>1) return null;
  const back = backCandidates[0] || null;
  if(back){
    if(!allClose(back,{x:innerX,y:cavityTop,z,width:innerW,height:cavityHeight}) ||
        n(back,'depth') < 3 || n(back,'depth') > 20) return null;
    classified.add(back.id);
  }
  const rear = back ? n(back,'depth') : 0;
  const bases=remaining.filter(p=>!classified.has(p.id) && ['toe_kick','plinth'].includes(role(p)));
  if(bases.length>1) return null;
  const base=bases[0]||null;
  const floor=y+height;
  if(base){
    if(!allClose(base,{x:innerX,y:floor-n(base,'height'),width:innerW,depth:thick}) ||
      n(base,'height') < 30 || n(base,'height') > 180 ||
      n(base,'z') < z || n(base,'z')+n(base,'depth') > z+depth+T ||
      z+depth-(n(base,'z')+n(base,'depth'))>150 ||
      !close(bottomY+n(bottom,'height'),n(base,'y'))) return null;
    classified.add(base.id);
  } else if(!close(bottomY+n(bottom,'height'),floor)) return null;
  const dividers=remaining.filter(p=>!classified.has(p.id) && hasRole(p,'divider')).sort((a,b)=>a.x-b.x);
  if(dividers.length > 4) return null;
  const sectionThick=topThickness;
  let last=innerX;
  for(const divider of dividers){
    if(!allClose(divider,{y:cavityTop,z:z+rear,width:thick,height:cavityHeight,depth:depth-rear}) ||
      n(divider,'x') < last+280 || n(divider,'x') > innerRight-280) return null;
    classified.add(divider.id);
    last=n(divider,'x')+thick;
  }
  if(innerRight-last < 280) return null;
  const starts=[innerX,...dividers.map(d=>n(d,'x')+thick)];
  const ends=[...dividers.map(d=>n(d,'x')),innerRight];
  const bayW=starts.map((start,i)=>ends[i]-start);
  if(bayW.some(v=>v<280)) return null;
  const shelves=remaining.filter(p=>!classified.has(p.id) &&
    (hasRole(p,'shelf') || (role(p)==='board_panel' && n(p,'height')<=50)));
  const byBay=starts.map(()=>[]);
  for(const shelf of shelves){
    const bay=starts.findIndex((b,i)=>close(n(shelf,'x'),b)&&close(n(shelf,'width'),bayW[i]));
    if(bay<0 || n(shelf,'height') < 10 || n(shelf,'height')>50 ||
       !close(n(shelf,'z'),z+rear) || !close(n(shelf,'depth'),depth-rear) ||
       n(shelf,'y')-cavityTop < 100 || bottomY-(n(shelf,'y')+n(shelf,'height'))<100) return null;
    byBay[bay].push(shelf);
    classified.add(shelf.id);
  }
  for(const items of byBay){
    items.sort((a,b)=>a.y-b.y);
    for(let i=1;i<items.length;i++) if(n(items[i],'y')-(n(items[i-1],'y')+n(items[i-1],'height'))<100) return null;
  }
  if(classified.size !== parts.length) return null;
  const outerHeight=cap ? height+topThickness : height;
  const current={width,height:outerHeight,depth};
  const stored=left.customerCarcassResizeBaseline;
  const baseline=stored && ['width','height','depth'].every(k=>Number.isSafeInteger(Number(stored[k])) && Number(stored[k])>0)
    ? {width:Number(stored.width),height:Number(stored.height),depth:Number(stored.depth)}
    : current;
  const minMax={
    width:[Math.max(420, Math.ceil(baseline.width*.8)),Math.min(2400,Math.floor(baseline.width*1.2))],
    height:[Math.max(450, Math.ceil(baseline.height*.85)),Math.min(2600,Math.floor(baseline.height*1.15))],
    depth:[Math.max(300, Math.ceil(baseline.depth*.8)),Math.min(1000,Math.floor(baseline.depth*1.2))],
  };
  if(['width','height','depth'].some(k=>current[k]<minMax[k][0]-T || current[k]>minMax[k][1]+T || minMax[k][0]>minMax[k][1])) return null;
  return {parts,left,right,top,bottom,back,base,dividers,shelves,starts,ends,bayW,byBay,innerX,innerW,cavityTop,cavityHeight,
    thick,sectionThick,x,y,z,floor,cap,rear,depth,width,height:outerHeight,baseline,minMax};
}

export function getCustomerValidatedPanelCarcassSupport(parts=[]) {
  const shape=inspect(parts);
  if(!shape) return error();
  const {width,height,depth,minMax}=shape;
  return {ok:true,validatedPanelCarcass:true,width,height,depth,
    minWidth:minMax.width[0],maxWidth:minMax.width[1],
    minHeight:minMax.height[0],maxHeight:minMax.height[1],
    minDepth:minMax.depth[0],maxDepth:minMax.depth[1],
    policy:'Validated carcass geometry only; Admin must review joinery, stability, door fit and final quotation.'};
}

export function planCustomerValidatedPanelCarcassResize(parts=[],axis,targetMm) {
  const shape=inspect(parts);
  if(!shape) return error();
  if(!Object.hasOwn(shape.minMax,axis)) return error('Unsupported dimension.');
  const target=Number(targetMm), [min,max]=shape.minMax[axis];
  if(!Number.isSafeInteger(target) || target<min || target>max) return error(`${axis} must be ${min}-${max} mm.`);
  const current=shape[axis];
  const delta=target-current;
  if(!delta) return {ok:true,parts:parts.map(p=>({...p})),[axis]:target,unchanged:true};
  const {left,right,top,bottom,back,base,dividers,shelves,bayW,starts,ends,innerX,innerW,cavityTop,cavityHeight,thick,rear}=shape;
  const changed=parts.map(p=>({...p}));
  const get=p=>changed[parts.indexOf(p)];
  const L=get(left),R=get(right),TOP=get(top),BOT=get(bottom);
  if(axis==='width') {
    R.x=rounded(n(right,'x')+delta);
    TOP.width=rounded(n(top,'width')+delta);
    BOT.width=rounded(n(bottom,'width')+delta);
    if(back) get(back).width=rounded(n(back,'width')+delta);
    if(base) get(base).width=rounded(n(base,'width')+delta);
    // Resize each bay proportionally; divider thickness stays unchanged.
    const oldUsable=bayW.reduce((sum,w)=>sum+w,0);
    const available=oldUsable+delta;
    if(available < bayW.length*280) return error('Bay openings would become too narrow.');
    const nextWidths=bayW.map(w=>w*available/oldUsable);
    const nextStarts=[];let edge=innerX;
    for(let i=0;i<nextWidths.length;i++){
      nextStarts.push(rounded(edge));edge+=nextWidths[i];
      if(dividers[i]){get(dividers[i]).x=rounded(edge);edge+=thick;}
    }
    for(let i=0;i<shape.byBay.length;i++)for(const p of shape.byBay[i]){
      get(p).x=nextStarts[i];get(p).width=rounded(nextWidths[i]);
    }
  } else if(axis==='height') {
    L.y=rounded(n(left,'y')-delta);L.height=rounded(n(left,'height')+delta);
    R.y=rounded(n(right,'y')-delta);R.height=rounded(n(right,'height')+delta);
    TOP.y=rounded(n(top,'y')-delta);
    if(back){get(back).y=rounded(n(back,'y')-delta);get(back).height=rounded(n(back,'height')+delta);}
    for(const p of dividers){get(p).y=rounded(n(p,'y')-delta);get(p).height=rounded(n(p,'height')+delta);}
    const newTop=cavityTop-delta,newCavity=cavityHeight+delta;
    for(const p of shelves)get(p).y=rounded(newTop+(n(p,'y')-cavityTop)*newCavity/cavityHeight);
  } else if(axis==='depth') {
    L.depth=rounded(n(left,'depth')+delta);R.depth=rounded(n(right,'depth')+delta);
    TOP.depth=rounded(n(top,'depth')+delta);BOT.depth=rounded(n(bottom,'depth')+delta);
    if(base)get(base).z=rounded(n(base,'z')+delta);
    for(const p of dividers)get(p).depth=rounded(n(p,'depth')+delta);
    for(const p of shelves)get(p).depth=rounded(n(p,'depth')+delta);
  }
  if (!left.customerCarcassResizeBaseline) L.customerCarcassResizeBaseline={...shape.baseline};
  const after=inspect(changed);
  if(!after || Math.abs(after[axis]-target)>T ||
    ['width','height','depth'].some(k=>k!==axis && !close(after[k],shape[k])) ||
    !close(after.floor,shape.floor) || !noForbiddenChange(parts,changed)) {
      return error('Requested change would break validated panel attachments or floor contact.');
  }
  return {ok:true,parts:changed,[axis]:target,policy:getCustomerValidatedPanelCarcassSupport(changed).policy};
}
