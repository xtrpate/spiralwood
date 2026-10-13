/**
 * WISDOM U2: Pure, family-neutral Admin construction relationship proposals.
 * Read-only staging for an explicitly reviewed U1 DRAFT. Not stored, not
 * customer authorization, not structural/manufacturing certification.
 */
import {
  createUniversalManualConstructionDraft,
  previewUniversalManualConstructionResize,
} from './universalManualConstructionU1.mjs';
import {manualWorldBoxU8, manualWorldFrameU8} from './universalManualWorldBoundsU8.mjs';

export const U2_REVIEW_VERSION = 1;
export const U2_RULE_CHOICES = Object.freeze([
  { value: 'min', label: 'Start of furniture (0%)' },
  { value: 'max', label: 'End of furniture (100%)' },
  { value: 'center', label: 'Center of furniture (50%)' },
  { value: 'quarter', label: 'Quarter point (25%)' },
  { value: 'three-quarter', label: 'Three-quarter point (75%)' },
]);
const AXES = Object.freeze({ width: 'x', height: 'y', depth: 'z' });
const text = x => String(x ?? '').trim();
const round = n => Math.round(n * 1000) / 1000;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const error = (code, message) => ({ok:false,code,error:message,customerResizable:false});
const exactInteger = x => typeof x === 'number' && Number.isSafeInteger(x);
const sanitize = items => Array.isArray(items) ? items.filter(p=>p && p.type!=='reference_proxy' && p.type!=='human_reference' && p.isReference!==true && p.isHumanReference!==true) : [];

export function manualReviewBoundsU2(parts) {
  const p = sanitize(parts);
  if (p.length === 0) return null;
  return manualWorldFrameU8(p);
}

/** Auto-SUGGESTED only; never counted as an Admin approval. */
export function suggestManualEdgeRuleU2(edge, bounds) {
  if (!bounds || !finite(edge) || !finite(bounds.size) || bounds.size<=0) return 'center';
  const fraction = (edge-bounds.min)/bounds.size;
  if(fraction <= 0.15) return 'min';
  if(fraction >= 0.85) return 'max';
  if(fraction >= 0.4 && fraction <= 0.6) return 'center';
  if(fraction < 0.4) return 'quarter';
  return 'three-quarter';
}

export function proposeManualConstructionReviewU2(items) {
  const parts=sanitize(items), bounds=manualReviewBoundsU2(parts);
  if(!bounds) return error('SCENE_EMPTY','Add real furniture parts with valid saved dimensions first.');
  const ids = new Set(), proposed = {};
  for(const p of parts) {
    const id=text(p.id);
    if(!id || ids.has(id))return error('PART_IDS','Each construction part needs a unique saved ID.');
    ids.add(id);
    proposed[id]={};
    for(const [axis] of Object.entries(AXES)) {
      const b=manualWorldBoxU8(p);
      if(!b)return error('ROTATED_PART','Only 0 or 90/270-degree Y rotations are supported.');
      const pair=axis==='width'?['minX','maxX']:axis==='height'?['minY','maxY']:['minZ','maxZ'];
      const start=b[pair[0]],end=b[pair[1]];
      proposed[id][axis]={
        start:suggestManualEdgeRuleU2(start,bounds[axis]),
        end:suggestManualEdgeRuleU2(end,bounds[axis]),
      };
    }
  }
  return {
    ok:true, version:U2_REVIEW_VERSION, parts, bounds,
    proposedRules:proposed,
    // These are only displayed as suggested starting values. Admin must set
    // the permitted boundaries consciously and confirm each physical part.
    suggestedLimits:Object.fromEntries(Object.entries(bounds).map(([axis,b])=>[
      axis,{min:Math.max(1,Math.ceil(b.size*0.9)),max:Math.floor(b.size*1.1)}
    ])),
    customerResizable:false,
    warning:'Automatic proposals are NOT approval. Verify every part, connection and range with Admin before preview.',
  };
}

export function ruleChoiceToAnchorU2(choice) {
  if(choice==='min'||choice==='max') return choice;
  if(choice==='center') return {basis:'fraction',fraction:0.5};
  if(choice==='quarter')return {basis:'fraction',fraction:0.25};
  if(choice==='three-quarter')return {basis:'fraction',fraction:0.75};
  return null;
}

/**
 * Admin checkedIDs MUST be explicit; a generated proposal never passes itself.
 * No full, persistent or customer-resizable profile is authorized here.
 */
export function reviewManualConstructionDraftU2(items, {rulesByPartId,limits,confirmedPartIds=[],pivots={}}={}) {
  const proposal=proposeManualConstructionReviewU2(items);
  if(!proposal.ok)return proposal;
  const parts=proposal.parts, ids=parts.map(p=>text(p.id));
  if(!Array.isArray(confirmedPartIds) || new Set(confirmedPartIds).size!==ids.length ||
    ids.some(id=>!confirmedPartIds.includes(id))) {
    return error('REVIEW_INCOMPLETE',`Admin must inspect and confirm all ${ids.length} physical parts before preview.`);
  }
  if(!rulesByPartId || Object.keys(rulesByPartId).length!==ids.length)return error('RULES_INCOMPLETE','All physical parts need six reviewed edge choices.');
  const mapped={};
  for(const id of ids) {
    const per=rulesByPartId[id];
    if(!per || Object.keys(per).length!==3)return error('RULES_INCOMPLETE',`Missing reviewed axes for ${id}.`);
    mapped[id]={};
    for(const axis of Object.keys(AXES)){
      const pair=per[axis];
      if(!pair) return error('RULES_INCOMPLETE',`Missing ${axis} pair for ${id}.`);
      const start=ruleChoiceToAnchorU2(pair.start),end=ruleChoiceToAnchorU2(pair.end);
      if(!start || !end)return error('UNKNOWN_ANCHOR',`${id}: unsupported ${axis} edge rule.`);
      mapped[id][axis]={start,end};
    }
  }
  const safeLimits={};
  for(const axis of Object.keys(AXES)) {
    const min=Number(limits?.[axis]?.min),max=Number(limits?.[axis]?.max);
    if(!exactInteger(min)||!exactInteger(max)||min<=0||max<min ||
      min>proposal.bounds[axis].size || max<proposal.bounds[axis].size)
      return error('INVALID_LIMITS',`Confirm integer min/max limits for ${axis}, including its original size.`);
    safeLimits[axis]={min,max};
  }
  const draft=createUniversalManualConstructionDraft(parts,{
    rulesByPartId:mapped,allowedDimensions:safeLimits,pivots,
  });
  if(!draft.ok)return {...draft,customerResizable:false};
  // Probe all eight min/max corner combinations. This is finite preview QA,
  // NOT a proof of safe geometry throughout the full ranges or of carpentry.
  const combinations=[];
  for(const width of [safeLimits.width.min,safeLimits.width.max])
    for(const height of [safeLimits.height.min,safeLimits.height.max])
      for(const depth of [safeLimits.depth.min,safeLimits.depth.max])
        combinations.push({width,height,depth});
  for(const target of combinations) {
    const preview=previewUniversalManualConstructionResize(parts,draft.profile,target);
    if(!preview.ok)return error('PREVIEW_REJECTED',`Geometry review failed at W${target.width} H${target.height} D${target.depth}: ${preview.error}`);
  }
  return {
    ok:true, previewOnly:true, customerResizable:false, status:'draft_reviewed_preview_only',
    partCount:parts.length, cornerChecks:combinations.length,
    draftProfile:draft.profile,
    baselineBounds:proposal.bounds,
    note:'U2 Admin-only review pass. Not saved, not approved, not Customer-resizable.',
  };
}
