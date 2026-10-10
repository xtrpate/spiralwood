// CUST-B2 — explicitly verified 10-part bookshelf family only.
// No generic component scaling and no auto-changing board thickness.
// These limits are provisional and require Admin review for fabrication.
const LIMITS = Object.freeze({
  width: [1400, 2000],
  height: [1300, 1750],
  depth: [500, 650],
});
const BOARD = 18;
const SUPPORT = 60;
const EXPECTED = Object.freeze({
  'WR-SL': 1, 'WR-SR': 1, 'WR-TOP': 1, 'WR-BOT': 1,
  'WR-BKL': 1, 'WR-BKS': 1, 'WR-SH1': 2, 'WR-SH2': 1, 'WR-SH3': 1,
});
const EXPECTED_TYPE = Object.freeze({
  'WR-SL': 'wr_side_panel', 'WR-SR': 'wr_side_panel',
  'WR-TOP': 'wr_top_panel', 'WR-BOT': 'wr_bottom_panel',
  'WR-BKL': 'wr_back_panel', 'WR-BKS': 'wr_back_support',
  'WR-SH1': 'wr_shelf', 'WR-SH2': 'wr_shelf', 'WR-SH3': 'wr_shelf',
});
const codeOf = p => String(p?.partCode || p?.part_code || p?.technicalId || '').trim().toUpperCase();
const close = (a, b) => Math.abs(Number(a) - Number(b)) <= 1;
const noRotation = p => ['rotationX','rotationY','rotationZ'].every(k => close(p[k] || 0, 0));
const validPart = p => p && ['x','y','z','width','height','depth'].every(k =>
  Number.isFinite(Number(p[k]))) && ['width','height','depth'].every(k => Number(p[k]) > 0) && noRotation(p);
const fail = (reason='This bookshelf layout is not verified for safe resizing.') => ({ok:false, error:reason});

export function getCustomerBookshelfResizeSupport(parts = []) {
  if (!Array.isArray(parts) || parts.length !== 10) return fail();
  const byCode = new Map();
  for (const p of parts) {
    const code = codeOf(p);
    if (!(code in EXPECTED) || !validPart(p) ||
        String(p.type || '').toLowerCase() !== EXPECTED_TYPE[code]) return fail();
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(p);
  }
  if (Object.entries(EXPECTED).some(([code,n]) => (byCode.get(code)?.length || 0) !== n)) return fail();
  const one = code => byCode.get(code)[0];
  const left=one('WR-SL'), right=one('WR-SR'), top=one('WR-TOP'), bottom=one('WR-BOT');
  const back=one('WR-BKL'), seam=one('WR-BKS');
  const shelves=[...byCode.get('WR-SH1'),one('WR-SH2'),one('WR-SH3')]
    .sort((a,b)=> Number(a.y)-Number(b.y));
  const x=Number(left.x), y=Number(left.y), z=Number(left.z);
  const width=Number(right.x)+Number(right.width)-x;
  const height=Number(left.height), depth=Number(left.depth);
  if (Object.entries({width,height,depth}).some(([k,v])=>
    !Number.isSafeInteger(v) || v<LIMITS[k][0] || v>LIMITS[k][1])) return fail();
  if (!close(left.width,BOARD) || !close(right.width,BOARD) ||
      !close(right.x,x+width-BOARD) || !close(right.y,y) ||
      !close(right.height,height) || !close(right.z,z) || !close(right.depth,depth) ||
      !close(top.x,x+BOARD) || !close(top.y,y) || !close(top.z,z) ||
      !close(top.width,width-2*BOARD) || !close(top.height,BOARD) || !close(top.depth,depth) ||
      !close(bottom.x,x+BOARD) || !close(bottom.y,y+height-20) || !close(bottom.z,z) ||
      !close(bottom.width,width-2*BOARD) || !close(bottom.height,BOARD) || !close(bottom.depth,depth)) return fail();
  // This particular production sample has one back sheet with a 3 mm left
  // inset from the top panel and a 7 mm right overlap. Preserve its as-saved
  // geometry; do not silently reconstruct it as a two-sheet wardrobe back.
  if (!close(back.x,x+21) || !close(back.y,y) || !close(back.z,z) ||
      !close(back.width,width-32) || !close(back.height,height-10) ||
      !close(back.depth,BOARD) ||
      !close(seam.x,x+width/2-SUPPORT/2) || !close(seam.y,y) ||
      !close(seam.z,z+BOARD) || !close(seam.width,SUPPORT) ||
      !close(seam.height,height) || !close(seam.depth,BOARD)) return fail();
  for (const shelf of shelves) {
    if (!close(shelf.x,x+BOARD) || !close(shelf.z,z+40) ||
        !close(shelf.width,width-BOARD*2) || !close(shelf.height,BOARD) ||
        !close(shelf.depth,depth-40)) return fail();
  }
  let previousEnd=y+BOARD;
  for (const shelf of shelves) {
    if (Number(shelf.y) - previousEnd < 120) return fail('Not enough clearance between bookshelf shelves.');
    previousEnd=Number(shelf.y)+BOARD;
  }
  if ((y+height-20)-previousEnd < 120) return fail('Not enough clearance above the bottom shelf.');
  return {
    ok:true, width, height, depth,
    minWidth:LIMITS.width[0], maxWidth:LIMITS.width[1],
    minHeight:LIMITS.height[0], maxHeight:LIMITS.height[1],
    minDepth:LIMITS.depth[0], maxDepth:LIMITS.depth[1],
    policy:'Provisional bookshelf sizing. Admin must confirm materials, support and quotation.',
  };
}

export function planCustomerBookshelfResize(parts = [], axis, targetMm) {
  const before=getCustomerBookshelfResizeSupport(parts);
  if (!before.ok) return before;
  if (!Object.prototype.hasOwnProperty.call(LIMITS,axis)) return fail('Unsupported dimension.');
  const wanted=Number(targetMm);
  if (!Number.isSafeInteger(wanted) || wanted<LIMITS[axis][0] || wanted>LIMITS[axis][1]) {
    return fail(`${axis.charAt(0).toUpperCase()+axis.slice(1)} must be ${LIMITS[axis][0]}-${LIMITS[axis][1]} mm.`);
  }
  if (wanted===before[axis]) return {ok:true,parts:parts.map(p=>({...p})),[axis]:wanted,unchanged:true};
  const left=parts.find(p=>codeOf(p)==='WR-SL');
  const x=Number(left.x),y=Number(left.y);
  const delta=wanted-before[axis];
  const candidate=parts.map(part=>{
    const p={...part};
    const code=codeOf(p);
    if (axis==='width') {
      if (code==='WR-SR') p.x=Number(p.x)+delta;
      else if (code==='WR-TOP'||code==='WR-BOT'||code.startsWith('WR-SH')) p.width=Number(p.width)+delta;
      else if (code==='WR-BKL') p.width=Number(p.width)+delta;
      else if (code==='WR-BKS') p.x=Math.round((x+wanted/2-SUPPORT/2)*10)/10;
    } else if (axis==='height') {
      if (code==='WR-SL'||code==='WR-SR'||code==='WR-BKS') p.height=Number(p.height)+delta;
      else if (code==='WR-BKL') p.height=Number(p.height)+delta;
      else if (code==='WR-BOT') p.y=Number(p.y)+delta;
      else if (code.startsWith('WR-SH')) {
        // Reflow the *position* of each shelf, never its 18 mm thickness.
        const topClear=BOARD;
        const oldSpan=before.height-20-topClear;
        const newSpan=wanted-20-topClear;
        p.y=Math.round(y+topClear+(Number(p.y)-y-topClear)*newSpan/oldSpan);
      }
    } else if (axis==='depth') {
      if (code==='WR-SL'||code==='WR-SR'||code==='WR-TOP'||code==='WR-BOT') p.depth=Number(p.depth)+delta;
      else if (code.startsWith('WR-SH')) p.depth=Number(p.depth)+delta;
      // The recessed 18 mm back and center seam stay at the same Z.
    }
    return p;
  });
  const check=getCustomerBookshelfResizeSupport(candidate);
  if (!check.ok || check[axis]!==wanted ||
      ['width','height','depth'].some(k=> k!==axis && check[k]!==before[k])) {
    return fail(check.error || 'New dimensions did not preserve the bookshelf construction.');
  }
  // All established component identities and their display finishes survive.
  if(candidate.some((p,i)=>codeOf(p)!==codeOf(parts[i]) ||
       p.id!==parts[i].id || p.finish_color!==parts[i].finish_color ||
       p.material!==parts[i].material || p.woodFinish!==parts[i].woodFinish)) {
    return fail('Resizing changed protected component identity or finish.');
  }
  return {ok:true,parts:candidate,[axis]:wanted,policy:check.policy};
}
