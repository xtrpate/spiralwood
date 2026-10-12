/**
 * U5: Customer *preview only* for server-verified U4 constructions.
 * Customer order/cart submission of edited universal geometry stays blocked
 * pending U6 server-side snapshot authorization. No implicit manufacturing approval.
 */
import { previewUniversalManualConstructionResize } from './universalManualConstructionU1.mjs';
import { manualWorldFrameU8 } from './universalManualWorldBoundsU8.mjs';
const AXES = ['width','height','depth'];
const GEOMETRY = ['x','y','z','width','height','depth'];
const near = (a,b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a)-Number(b)) <= 0.051;
const fail = error => ({ok:false,error});
const sameGeometry = (a,b) => a?.id === b?.id && a?.partCode === b?.partCode &&
  GEOMETRY.every(k => near(a[k],b[k])) &&
  ['rotationX','rotationY','rotationZ'].every(k => near(a[k]??0,b[k]??0));
const dimsOf = parts => {
  const frame=manualWorldFrameU8(parts);
  return frame ? Object.fromEntries(AXES.map(axis=>[axis,frame[axis].size])) : null;
};
export function getCustomerUniversalManualPreviewSupport(authorization, liveParts) {
  if(authorization?.verified !== true || authorization?.previewOnly !== true ||
     authorization?.profile?.status !== 'draft' ||
     authorization?.profile?.customerResizable !== false ||
     authorization?.profile?.approval !== 'not_reviewed' ||
     !Array.isArray(authorization?.sourceParts) ||
     !Array.isArray(liveParts) || authorization.sourceParts.length !== liveParts.length ||
     authorization.sourceParts.length < 2 || authorization.sourceParts.length > 300)
    return fail('Manual construction review is missing or not verified.');
  const original = authorization.sourceParts;
  const profile = authorization.profile;
  const current = dimsOf(liveParts);
  if(!current || AXES.some(axis=>!Number.isSafeInteger(current[axis])))
    return fail('Current scene has unsupported fractional overall dimensions.');
  // U1 validates the original part *identity, source geometry and contact graph*.
  const expected = previewUniversalManualConstructionResize(original,profile,current);
  if(!expected.ok) return fail(expected.error || 'The original reviewed construction no longer matches.');
  const lookup = new Map(expected.parts.map(p=>[p.id,p]));
  if(lookup.size!==expected.parts.length || liveParts.some(p=>!sameGeometry(p,lookup.get(p.id))))
    return fail('The Customer 3D scene differs from the reviewed construction.');
  const limits=profile.dimensionLimits;
  if(!limits || AXES.some(axis=>!Number.isSafeInteger(limits[axis]?.min)||!Number.isSafeInteger(limits[axis]?.max)))
    return fail('Reviewed size ranges are invalid.');
  return {ok:true,previewOnly:true,original,profile,current,
    minWidth:limits.width.min,maxWidth:limits.width.max,
    minHeight:limits.height.min,maxHeight:limits.height.max,
    minDepth:limits.depth.min,maxDepth:limits.depth.max};
}
export function planCustomerUniversalManualPreviewResize(authorization, liveParts, axis, wanted) {
  if(!AXES.includes(axis) || !Number.isSafeInteger(wanted))return fail('Enter an integer size in millimeters.');
  const support=getCustomerUniversalManualPreviewSupport(authorization,liveParts);
  if(!support.ok)return support;
  const wantedDimensions={...support.current,[axis]:wanted};
  const preview=previewUniversalManualConstructionResize(support.original,support.profile,wantedDimensions);
  if(!preview.ok)return fail(preview.error || 'Construction geometry could not be resized.');
  const byId=new Map(preview.parts.map(p=>[p.id,p]));
  const parts=liveParts.map(p=>{
    const next=byId.get(p.id);
    return {...p,...Object.fromEntries(GEOMETRY.map(k=>[k,next[k]]))};
  });
  return {ok:true,previewOnly:true,parts,...preview.dimensions};
}
export function isCustomerUniversalManualPreviewChanged(authorization, liveParts) {
  if(authorization?.verified!==true || !Array.isArray(liveParts))return false;
  const original=authorization.sourceParts;
  if(!Array.isArray(original) || original.length!==liveParts.length)return true;
  const byId=new Map(original.map(p=>[p.id,p]));
  return liveParts.some(p=>!sameGeometry(p,byId.get(p.id)));
}
