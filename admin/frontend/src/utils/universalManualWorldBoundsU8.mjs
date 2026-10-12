/**
 * U8-A: conservative world-axis bounds for the Admin editor's Y-quarter-turn panels.
 * Coordinates are saved as the UNROTATED box origin; mesh rotates about its center.
 * Zero / 90 / 270 degrees on Y only. Arbitrary and compound angles fail closed.
 * Output is physical world AABB, never a rewritten furniture design.
 */
const EPS = 1e-8;
const num = (p,k) => Number(p[k]);
const round = v => Math.round(v * 1000) / 1000;
const normalized = value => ((Number(value ?? 0) % 360) + 360) % 360;
const isZero = v => Math.abs(v) <= EPS || Math.abs(v - 360) <= EPS;
export function manualQuarterTurnU8(part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return null;
  for (const k of ['x','y','z','width','height','depth']) {
    if (part[k] == null || String(part[k]).trim() === '' || !Number.isFinite(num(part,k))) return null;
  }
  if (['width','height','depth'].some(k=>num(part,k)<=0)) return null;
  const rx=normalized(part.rotationX),ry=normalized(part.rotationY),rz=normalized(part.rotationZ);
  if (![rx,ry,rz].every(Number.isFinite) || !isZero(rx) || !isZero(rz)) return null;
  if (isZero(ry)) return 0;
  if (Math.abs(ry-90)<=EPS || Math.abs(ry-270)<=EPS) return 90;
  return null;
}
export function manualWorldBoxU8(part) {
  const quarter=manualQuarterTurnU8(part);
  if (quarter===null) return null;
  const x=num(part,'x'), y=num(part,'y'), z=num(part,'z');
  const w=num(part,'width'),h=num(part,'height'),d=num(part,'depth');
  const minX=quarter?x+(w-d)/2:x;
  const minZ=quarter?z+(d-w)/2:z;
  const maxX=minX+(quarter?d:w),maxZ=minZ+(quarter?w:d);
  return {minX:round(minX),maxX:round(maxX),minY:round(y),maxY:round(y+h),
    minZ:round(minZ),maxZ:round(maxZ)};
}
export function manualWorldFrameU8(parts) {
  if(!Array.isArray(parts)||!parts.length)return null;
  const boxes=parts.map(manualWorldBoxU8);
  if(boxes.some(b=>!b))return null;
  const axes={width:['minX','maxX'],height:['minY','maxY'],depth:['minZ','maxZ']};
  return Object.fromEntries(Object.entries(axes).map(([axis,[lo,hi]])=>{
    const min=Math.min(...boxes.map(b=>b[lo]));
    const max=Math.max(...boxes.map(b=>b[hi]));
    return [axis,{min:round(min),max:round(max),size:round(max-min)}];
  }));
}
/** Map Admin-confirmed physical WORLD edges back to a Y-rotated local box. */
export function manualPartFromWorldBoxU8(original,world) {
  const quarter=manualQuarterTurnU8(original);
  if(quarter===null)return null;
  for(const [lo,hi] of [['minX','maxX'],['minY','maxY'],['minZ','maxZ']]) {
    if(!Number.isFinite(world?.[lo])||!Number.isFinite(world?.[hi])||world[hi]-world[lo]<1-EPS)return null;
  }
  const sizeX=world.maxX-world.minX,sizeY=world.maxY-world.minY,sizeZ=world.maxZ-world.minZ;
  if(!quarter)return {...original,x:round(world.minX),y:round(world.minY),z:round(world.minZ),
    width:round(sizeX),height:round(sizeY),depth:round(sizeZ)};
  // local width points along world Z; local depth points along world X.
  const cx=(world.maxX+world.minX)/2,cz=(world.maxZ+world.minZ)/2;
  return {...original,x:round(cx-sizeZ/2),y:round(world.minY),z:round(cz-sizeX/2),
    width:round(sizeZ),height:round(sizeY),depth:round(sizeX)};
}
