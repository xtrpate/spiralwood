/**
 * WISDOM U1 - versioned, furniture-family-neutral construction constraints.
 * PURE GEOMETRY ENGINE used by U2 review, U4 server Save verification,
 * U5 Customer preview and U6 server quotation authorization. This is NOT
 * a production certification, inventory or pricing approval.
 *
 * Every physical part's six edges are bound to whole-assembly reference lines:
 * min, max, or fractional frame position with a fixed-mm offset.
 * Admin must explicitly confirm these edge relations in U2; no inference of
 * engineering capacity, carpentry joinery, materials or safe ranges is made.
 */
import { manualQuarterTurnU8, manualWorldBoxU8, manualWorldFrameU8, manualPartFromWorldBoxU8 } from './universalManualWorldBoundsU8.mjs';
export const UNIVERSAL_MANUAL_CONSTRUCTION_VERSION = 1;
const AXES = Object.freeze({
  width: Object.freeze({ pos: 'x', size: 'width', defaultPivot: 'min' }),
  height: Object.freeze({ pos: 'y', size: 'height', defaultPivot: 'max' }),
  depth: Object.freeze({ pos: 'z', size: 'depth', defaultPivot: 'min' }),
});
const EPS = 0.05;
const CONTACT_EPS = 0.25;
// U7 conservative section guard: no family IDs or per-furniture allowlist.
// Slab thicknesses and slender-post cross-sections require an Admin base-
// design edit, never an implicit whole-furniture W/H/D enlargement.
const SECTION_EPS = 0.051;
const PANEL_THIN_RATIO = 0.2;
const POST_SLENDER_RATIO = 3;
const POST_SECTION_SIMILARITY = 1.6;
const MAX_PARTS = 300;
const fail = (code, message) => ({ ok: false, code, error: message });
const round = value => Math.round(value * 1000) / 1000;
const near = (a, b, tolerance = EPS) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const text = value => String(value ?? '').trim();
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => JSON.parse(JSON.stringify(value));
const exactNumber = value => typeof value === 'number' && Number.isFinite(value);
const num = (part, key) => Number(part[key]);

function checkParts(input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > MAX_PARTS) {
    return fail('PART_COUNT', `Expected 2-${MAX_PARTS} distinct physical parts.`);
  }
  const ids = new Set(), codes = new Map();
  for (const p of input) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return fail('INVALID_PART', 'A part is not an object.');
    const id = text(p.id), code = text(p.partCode);
    if (!id || !code || ids.has(id)) {
      return fail('PART_IDENTITY', 'Every physical part needs a unique stable ID and a Part Code.');
    }
    ids.add(id);
    // Identical cuts MAY share a code (Admin Properties explicitly allows this).
    // Different physical cuts must have distinct codes for trustworthy BOM output.
    const cut=[text(p.type),text(p.partRole),text(p.material||p.wood_type),
      ...['width','height','depth'].map(k=>num(p,k))].join('|');
    if(codes.has(code) && codes.get(code)!==cut)
      return fail('PART_CODE_CUT_MISMATCH',`Part Code ${code} is reused for different physical cuts. Assign separate codes in Admin.`);
    codes.set(code,cut);
    if (!text(p.type) || !text(p.material || p.wood_type)) return fail('PART_IDENTITY', 'Part type/material is missing.');
    if (p.qty != null && (!Number.isSafeInteger(Number(p.qty)) || Number(p.qty) !== 1)) {
      return fail('MULTI_QUANTITY', 'A quantity greater than 1 requires separate physical instance modeling.');
    }
    if (p.locked === true || p.visible === false || Number(p.is_deleted || 0) === 1 ||
        p.isReference === true || p.isHumanReference === true || p.type === 'reference_proxy') {
      return fail('PART_STATE', 'Hidden, locked, deleted and reference objects are not physical resize parts.');
    }
    if (!['x','y','z','width','height','depth'].every(k => finite(num(p, k)) &&
        (['width','height','depth'].includes(k) ? num(p,k) > 0 : true) &&
        p[k] !== null && p[k] !== undefined && text(p[k]) !== '')) {
      return fail('INVALID_GEOMETRY', 'All physical part coordinates and sizes must be finite, positive where applicable.');
    }
    if (manualQuarterTurnU8(p) === null)
      return fail('ROTATED_PART', 'Only unrotated and exact Y=90/270 degree panels are currently supported. Arbitrary and compound 3D rotations remain protected.');
  }
  return {ok:true};
}

function frame(parts) { return manualWorldFrameU8(parts); }

function signature(p) {
  const keys = ['id','partCode','type','partRole','groupId','assemblyId','assemblyType','parentPartId','material','wood_type','qty',
    'x','y','z','width','height','depth','rotationX','rotationY','rotationZ'];
  // Motion metadata becomes part of the signed source identity for U8 drawers.
  if(motionOf(p)) keys.push('motionGroupId','motionReferencePartId','partFunction');
  return Object.fromEntries(keys.map(k => [k,p[k] ?? null]));
}

/**
 * U7 shape-derived invariant: only unambiguous thin section axes.
 * A plate/panel has one thin dimension; an elongated post has two nearly
 * equal small cross-section dimensions. Irregular blocks remain unclassified;
 * Admin must review their construction explicitly. Geometry is not a strength
 * or joint certification. This is intentionally independent of part labels.
 */
function protectedSectionAxes(part) {
  const ordered = ['width','height','depth']
    .map(axis => ({axis,size:num(part,axis)}))
    .sort((a,b) => a.size-b.size);
  const [small,middle,long] = ordered;
  if (small.size <= middle.size * PANEL_THIN_RATIO) return [small.axis];
  if (long.size >= middle.size * POST_SLENDER_RATIO &&
      middle.size <= small.size * POST_SECTION_SIMILARITY) {
    return [small.axis,middle.axis];
  }
  return [];
}

function verifyProtectedSections(originalParts, resizedParts) {
  for(let i=0;i<originalParts.length;i++) {
    const initial=originalParts[i],resized=resizedParts[i];
    for(const axis of protectedSectionAxes(initial)) {
      if(Math.abs(num(resized,axis)-num(initial,axis)) > SECTION_EPS) {
        return fail('SECTION_CHANGED',
          `Part ${text(initial.partCode)} changes fixed ${axis} section from `+
          `${num(initial,axis)} to ${num(resized,axis)} mm. `+
          `Review its edge anchors or change the original Admin part size.`);
      }
    }
  }
  return {ok:true};
}

function contactType(a,b,allowSeam=false) {
  const overlaps = [];
  const touching = [];
  const aa=manualWorldBoxU8(a), bb=manualWorldBoxU8(b);
  if(!aa||!bb)return null;
  for(const [lo,hi] of [['minX','maxX'],['minY','maxY'],['minZ','maxZ']]) {
    const a0=aa[lo], a1=aa[hi], b0=bb[lo], b1=bb[hi];
    const overlap = Math.min(a1,b1)-Math.max(a0,b0);
    overlaps.push(overlap);
    touching.push(near(a1,b0,CONTACT_EPS)||near(b1,a0,CONTACT_EPS));
  }
  if (overlaps.every(x => x > CONTACT_EPS)) return 'overlap';
  if (overlaps.filter(x => x > CONTACT_EPS).length === 2 &&
    overlaps.some((x,i)=>touching[i] && Math.abs(x) <= CONTACT_EPS)) return 'face';
  // Only within explicitly registered moving-drawer reviews and shared
  // cabinet assemblies: an existing 0..2.5mm panel seam may be reviewed.
  if (allowSeam && overlaps.filter(x => x > CONTACT_EPS).length === 2 &&
    overlaps.some(x => x < -CONTACT_EPS && x >= -2.5)) return 'seam';
  return null;
}

function contacts(parts,allowSeam=false) {
  const edges=[];
  const covered = new Map(parts.map(p=>[text(p.id),new Set()]));
  for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++) {
    const sameAssembly=String(parts[i].assemblyId??parts[i].groupId??'') &&
      String(parts[i].assemblyId??parts[i].groupId??'')===String(parts[j].assemblyId??parts[j].groupId??'');
    const kind=contactType(parts[i],parts[j],allowSeam&&Boolean(sameAssembly));
    if(!kind)continue;
    const left=text(parts[i].id),right=text(parts[j].id);
    edges.push({left,right,kind});
    covered.get(left).add(right);covered.get(right).add(left);
  }
  if (covered.size===0) return {connected:false,edges};
  const root=text(parts[0].id), seen=new Set([root]),queue=[root];
  for(let i=0;i<queue.length;i++)for(const next of covered.get(queue[i]))if(!seen.has(next)){seen.add(next);queue.push(next)}
  return {connected:seen.size===parts.length,edges};
}


const motionOf = p => text(p.motionGroupId ?? p.motion_group_id);
const motionRef = p => text(p.motionReferencePartId ?? p.motion_reference_part_id);
const worldOverlap = (a,b) => {
  const aa=manualWorldBoxU8(a),bb=manualWorldBoxU8(b);
  return [['minX','maxX'],['minY','maxY'],['minZ','maxZ']]
    .map(([lo,hi])=>Math.min(aa[hi],bb[hi])-Math.max(aa[lo],bb[lo]));
};
function reviewedTopology(parts) {
  const moving=parts.filter(p=>motionOf(p));
  if(!moving.length) {
    if(parts.some(p=>motionRef(p)))return fail('MOTION_INVALID','A movement reference must have a declared moving group.');
    return contacts(parts);
  }
  const fixed=parts.filter(p=>!motionOf(p));
  if(fixed.length<2)return fail('MOTION_INVALID','A drawer review needs its fixed cabinet construction.');
  if(fixed.some(p=>motionRef(p)))return fail('MOTION_INVALID','Fixed parts cannot reference a drawer motion group.');
  const base=contacts(fixed,true);
  if(!base.connected)return fail('DISCONNECTED_CONSTRUCTION','The fixed cabinet has detached panels beyond the reviewed seam tolerance.');
  const groups=new Map();
  for(const p of moving){
    const key=motionOf(p);
    if(!key.startsWith('manual-drawer-') || !motionRef(p) ||
      (p.partFunction && text(p.partFunction).toLowerCase()!=='drawer'))
      return fail('MOTION_INVALID','Only explicit, complete manual-drawer groups are supported in this review.');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  if(groups.size>20)return fail('MOTION_INVALID','Too many moving groups for a verified construction.');
  const edges=[...base.edges];
  const frameFixed=frame(fixed);
  for(const [group, members] of groups){
    if(members.length<2)return fail('MOTION_INVALID','Each moving drawer must contain multiple physical parts.');
    const ids=new Set(members.map(p=>text(p.id)));
    const reference=motionRef(members[0]);
    if(!ids.has(reference)||members.some(p=>motionRef(p)!==reference))
      return fail('MOTION_INVALID','Drawer members must share a real movement-reference part ID.');
    const structure=contacts(members,true);
    if(!structure.connected)return fail('DISCONNECTED_DRAWER','A moving drawer has disconnected physical panels.');
    const groupFrame=frame(members);
    for(const axis of ['width','height','depth']) {
      // A drawer may have a proud face/front outside the carcass by up to
      // 12mm (as in saved #296); larger departures require re-modeling.
      if(groupFrame[axis].min < frameFixed[axis].min-12.01 ||
         groupFrame[axis].max > frameFixed[axis].max+12.01)
        return fail('DRAWER_OUTSIDE_CARCASS',`Drawer ${group} protrudes beyond the cabinet ${axis} envelope.`);
    }
    if(members.some(a=>fixed.some(b=>worldOverlap(a,b).every(n=>n>CONTACT_EPS))))
      return fail('DRAWER_COLLISION','A moving drawer intersects fixed cabinet structure.');
    edges.push(...structure.edges);
  }
  for(const [a,aa] of groups)for(const [b,bb] of groups)if(a<b &&
    aa.some(p=>bb.some(q=>worldOverlap(p,q).every(n=>n>CONTACT_EPS))))
    return fail('DRAWER_COLLISION','Independent drawers intersect each other.');
  return {connected:true,edges,motionReviewed:true};
}

const legalAnchor = anchor => anchor === 'min' || anchor === 'max' ||
  (anchor && typeof anchor === 'object' && !Array.isArray(anchor) &&
   Object.keys(anchor).length === 2 && anchor.basis === 'fraction' &&
   exactNumber(anchor.fraction) && anchor.fraction>=0 && anchor.fraction<=1);

function anchorPosition(anchor, bounds) {
  if(anchor==='min') return bounds.min;
  if(anchor==='max') return bounds.max;
  return bounds.min+anchor.fraction*bounds.size;
}

function normalizeAnchor(anchor) {
  return typeof anchor === 'string' ? anchor : {basis:'fraction',fraction:anchor.fraction};
}

function validLimits(limits, bounds) {
  if(!limits || typeof limits!=='object')return false;
  return Object.keys(AXES).every(axis=>{
    const x=limits[axis];
    return x && exactNumber(x.min) && exactNumber(x.max) &&
      Number.isSafeInteger(x.min) && Number.isSafeInteger(x.max) &&
      x.min>0 && x.max>=x.min && x.min<=bounds[axis].size && x.max>=bounds[axis].size;
  });
}

/**
 * Compile explicit Admin-specified relations. Does NOT grant Customer access.
 *
 * rulesByPartId[id][axis] = {start:'min'|'max'|{basis:'fraction',fraction:.5}, end:...}
 * 'start' and 'end' refer to physical AABB edges, not UI control directions.
 * allowedDimensions = { width:{min,max}, height:{min,max}, depth:{min,max} }
 * pivots = {width:'min'|'max'|'center', height:'max', depth:'min'|'max'|'center'}
 */
export function createUniversalManualConstructionDraft(components, {rulesByPartId, allowedDimensions, pivots={}}={}) {
  const validated=checkParts(components);
  if(!validated.ok)return validated;
  const baseBounds=frame(components);
  if(!validLimits(allowedDimensions,baseBounds))return fail('INVALID_LIMITS', 'Admin must supply explicit integer min/max ranges for all axes, containing the original size.');
  if(!rulesByPartId || typeof rulesByPartId!=='object' || Array.isArray(rulesByPartId))
    return fail('MISSING_RULES','Admin must define two edge anchors per part and axis.');
  const ids=new Set(components.map(p=>text(p.id)));
  if(Object.keys(rulesByPartId).length!==ids.size || Object.keys(rulesByPartId).some(id=>!ids.has(id)))
    return fail('UNKNOWN_RULE', 'Rules must identify exactly the supplied physical parts.');
  const framePivots={};
  for(const axis of Object.keys(AXES)) {
    const p=pivots[axis]??AXES[axis].defaultPivot;
    if(!['min','max','center'].includes(p))return fail('INVALID_PIVOT',`Unsupported ${axis} frame anchor.`);
    framePivots[axis]=p;
  }
  const compiled={};
  for(const p of components) {
    const id=text(p.id),spec=rulesByPartId[id];
    if(!spec || Object.keys(spec).length!==3 || Object.keys(spec).some(axis=>!AXES[axis]))
      return fail('MISSING_RULES',`Each part needs width/height/depth rules: ${id}`);
    const axisConstraints={};
    for(const [axis,{pos,size}] of Object.entries(AXES)) {
      const r=spec[axis];
      if(!r || !legalAnchor(r.start) || !legalAnchor(r.end))
        return fail('INVALID_ANCHOR',`Part ${id} has an unsupported ${axis} edge anchor.`);
      const box=manualWorldBoxU8(p);
      const pair=axis==='width'?['minX','maxX']:axis==='height'?['minY','maxY']:['minZ','maxZ'];
      const b=baseBounds[axis],start=box[pair[0]],end=box[pair[1]];
      axisConstraints[axis]={
        start:{anchor:normalizeAnchor(r.start),offset:round(start-anchorPosition(r.start,b))},
        end:{anchor:normalizeAnchor(r.end),offset:round(end-anchorPosition(r.end,b))},
      };
    }
    compiled[id]=axisConstraints;
  }
  const topology=reviewedTopology(components);
  if(topology.ok===false)return topology;
  if(!topology.connected)return fail('DISCONNECTED_CONSTRUCTION','Physical contact graph is incomplete. Admin must verify detached parts before creating preview rules.');
  return {
    ok:true,
    profile: {
      schemaVersion: UNIVERSAL_MANUAL_CONSTRUCTION_VERSION,
      status:'draft',
      customerResizable:false,
      approval:'not_reviewed',
      referenceBounds:baseBounds,
      sourceParts:components.map(signature),
      dimensionLimits:clone(allowedDimensions),
      framePivots,
      edgeConstraints:compiled,
      contactGraph:topology.edges,
      ...(topology.motionReviewed ? {motionReview:'manual-drawer-world-aabb-u8'} : {}),
      note:'Geometry-only Admin draft. NOT structural certification or customer resize authorization.',
    },
  };
}

function validateProfileAgainstScene(profile, components) {
  if(!profile || profile.schemaVersion!==UNIVERSAL_MANUAL_CONSTRUCTION_VERSION ||
    profile.status!=='draft'||profile.customerResizable!==false||
    profile.approval!=='not_reviewed')return fail('NOT_DRAFT','Only unapproved U1 Admin preview drafts are supported.');
  const checked=checkParts(components);
  if(!checked.ok)return checked;
  if(components.some(p=>motionOf(p)) && profile.motionReview!=='manual-drawer-world-aabb-u8')
    return fail('SCENE_DRIFT','New moving groups require their own Admin review.');
  if(!Array.isArray(profile.sourceParts) || profile.sourceParts.length!==components.length)
    return fail('SCENE_DRIFT','Part list no longer matches the original source.');
  for(let i=0;i<components.length;i++) {
    if(JSON.stringify(signature(components[i]))!==JSON.stringify(profile.sourceParts[i]))
      return fail('SCENE_DRIFT','Saved part identity or geometry differs from the draft source.');
  }
  if(JSON.stringify(frame(components))!==JSON.stringify(profile.referenceBounds))
    return fail('SCENE_DRIFT','Original scene bounds changed.');
  if(!validLimits(profile.dimensionLimits,profile.referenceBounds))
    return fail('INVALID_PROFILE','Profile range is invalid.');
  if(!profile.edgeConstraints || Object.keys(profile.edgeConstraints).length!==components.length)
    return fail('INVALID_PROFILE','Profile edge constraints are missing.');
  return {ok:true};
}

function adjustedBounds(original,target,pivot) {
  if(pivot==='min')return {min:original.min,max:original.min+target,size:target};
  if(pivot==='max')return {min:original.max-target,max:original.max,size:target};
  const mid=(original.min+original.max)/2;
  return {min:mid-target/2,max:mid+target/2,size:target};
}

function projectEdge(edge, bounds) {
  if(!edge || !legalAnchor(edge.anchor) || !finite(edge.offset))return NaN;
  return anchorPosition(edge.anchor,bounds)+edge.offset;
}

/** Preview new geometry against immutable original, so repeated W/H/D is drift-free. */
export function previewUniversalManualConstructionResize(components, profile, requestedDimensions={}) {
  const verified=validateProfileAgainstScene(profile,components);
  if(!verified.ok)return verified;
  if(!requestedDimensions || typeof requestedDimensions!=='object'||Array.isArray(requestedDimensions) ||
    Object.keys(requestedDimensions).some(k=>!AXES[k]))return fail('INVALID_TARGET','Unknown requested dimensions.');
  const targetBounds={};
  for(const axis of Object.keys(AXES)) {
    const wanted=requestedDimensions[axis]??profile.referenceBounds[axis].size;
    const lim=profile.dimensionLimits[axis];
    if(!exactNumber(wanted) || !Number.isSafeInteger(wanted) || wanted<lim.min || wanted>lim.max)
      return fail('TARGET_OUT_OF_RANGE',`${axis} must be an integer between ${lim.min} and ${lim.max} mm.`);
    if(!['min','max','center'].includes(profile.framePivots?.[axis]))
      return fail('INVALID_PROFILE',`Unknown ${axis} pivot.`);
    targetBounds[axis]=adjustedBounds(profile.referenceBounds[axis],wanted,profile.framePivots[axis]);
  }
  const updated=[];
  for(const original of components) {
    const id=text(original.id), rules=profile.edgeConstraints[id];
    if(!rules)return fail('INVALID_PROFILE',`Missing profile for part ${id}.`);
    const world={};
    for(const [axis] of Object.entries(AXES)) {
      const edges=rules[axis];
      const start=projectEdge(edges?.start,targetBounds[axis]);
      const end=projectEdge(edges?.end,targetBounds[axis]);
      if(!finite(start)||!finite(end)||end-start<1-EPS)
        return fail('INVALID_RESULT',`Part ${id} would collapse or have invalid ${axis} geometry.`);
      const pair=axis==='width'?['minX','maxX']:axis==='height'?['minY','maxY']:['minZ','maxZ'];
      world[pair[0]]=round(start);world[pair[1]]=round(end);
    }
    const next=manualPartFromWorldBoxU8(original,world);
    if(!next)return fail('INVALID_RESULT',`Part ${id} has unsupported rotated bounds.`);
    updated.push(next);
  }
  const sectionCheck=verifyProtectedSections(components,updated);
  if(!sectionCheck.ok)return sectionCheck;
  const nextCheck=checkParts(updated);
  if(!nextCheck.ok)return fail('INVALID_RESULT',nextCheck.error);
  const after=frame(updated);
  for(const axis of Object.keys(AXES)) {
    if(!near(after[axis].min,targetBounds[axis].min,CONTACT_EPS) ||
       !near(after[axis].max,targetBounds[axis].max,CONTACT_EPS))
      return fail('BOUNDARY_MISMATCH',`The requested ${axis} is not represented by the output assembly.`);
  }
  const beforeGraph=reviewedTopology(components);
  const afterGraph=reviewedTopology(updated);
  if(beforeGraph.ok===false)return beforeGraph;
  if(afterGraph.ok===false)return afterGraph;
  if(!afterGraph.connected)return fail('CONNECTION_LOST','The resized assembly loses physical contacts.');
  const toKey=e=>[e.left,e.right].sort().join('|');
  const beforeMap=new Map(beforeGraph.edges.map(e=>[toKey(e),e.kind]));
  const afterMap=new Map(afterGraph.edges.map(e=>[toKey(e),e.kind]));
  if(beforeMap.size!==afterMap.size || [...beforeMap].some(([key,kind])=>afterMap.get(key)!==kind))
    return fail('CONTACT_CHANGED','The proposed geometry changes the existing physical contact graph.');
  return {
    ok:true,
    previewOnly:true,
    customerResizable:false,
    dimensions:Object.fromEntries(Object.keys(AXES).map(axis=>[axis,targetBounds[axis].size])),
    parts:updated,
    note:'Admin preview only. Further engineering/fit review and backend approval needed.',
  };
}

export function inspectUniversalManualConstructionDraft(components, profile) {
  const tested=validateProfileAgainstScene(profile,components);
  return tested.ok
    ? {ok:true, customerResizable:false, status:'draft', partCount:components.length, baseDimensions:
      Object.fromEntries(Object.keys(AXES).map(axis=>[axis,profile.referenceBounds[axis].size])),
      physicalContacts:profile.contactGraph.length }
    : tested;
}
