import React, { useMemo, useState } from 'react';
import { planUniversalManualAdminPreviewU3 } from '../../../utils/universalManualPreviewU3.mjs';
import {
  U2_RULE_CHOICES,
  proposeManualConstructionReviewU2,
  reviewManualConstructionDraftU2,
} from '../../../utils/universalManualReviewU2.mjs';

// Admin-only U2: edit and confirm edge relationships in memory. Does not Save,
// Publish, change the 3D scene, or grant Customer resizing authorization.
const AXES = ['width', 'height', 'depth'];
const EDGES = ['start', 'end'];
const dark = {background:'#0f172a',color:'#e2e8f0',border:'1px solid #475569',padding:'7px 9px',borderRadius:2};
const field = { ...dark, minWidth:70, maxWidth:130, width:'100%' };
const action = { ...dark, cursor:'pointer',background:'#1e293b',fontSize:12,fontWeight:600 };
const label = {display:'block',fontSize:11,color:'#cbd5e1',marginBottom:5};
const heading = {fontSize:12,fontWeight:700,color:'#f8fafc',marginBottom:8};

export function ManualConstructionReviewU2({components = [], onShowPreview = null, onStageReviewed = null, onInvalidateReviewed = null}) {
  const proposal = useMemo(()=>proposeManualConstructionReviewU2(components),[components]);
  const [open,setOpen] = useState(false);
  const [rules,setRules] = useState(()=>proposal.ok ? proposal.proposedRules : {});
  const [limits,setLimits] = useState(()=>proposal.ok ? proposal.suggestedLimits : {});
  const [confirmed,setConfirmed] = useState([]);
  const [result,setResult] = useState(null);
  const [previewDimensions,setPreviewDimensions] = useState(()=>proposal.ok ? Object.fromEntries(AXES.map(axis=>[axis,String(Math.round(proposal.bounds[axis].size))])) : {});
  const [previewError,setPreviewError] = useState(null);
  const [selected,setSelected] = useState(()=>proposal.ok ? String(proposal.parts[0]?.id ?? '') : '');
  // Parent assigns a geometry signature key, remounting this component when a
  // part changes. Stale confirmations cannot apply to a changed scene.
  const selectedPart = proposal.ok ? proposal.parts.find(p=>String(p.id)===selected) : null;
  const total = proposal.ok ? proposal.parts.length : 0;
  const setEdge = (id,axis,edge,value) => {
    setRules(previous=>({ ...previous,[id]:{...previous[id],[axis]:{...previous[id]?.[axis],[edge]:value}}}));
    setConfirmed(old=>old.filter(x=>x!==id));setResult(null);setPreviewError(null);onInvalidateReviewed?.();
  };
  const setRange = (axis,bound,value) => {
    setLimits(old=>({...old,[axis]:{...old[axis],[bound]:value}}));setResult(null);setPreviewError(null);onInvalidateReviewed?.();
  };
  const settings = () => ({rulesByPartId:rules,limits,confirmedPartIds:confirmed,
    pivots:{width:'min',height:'max',depth:'min'}});
  const check = () => {
    setPreviewError(null);
    setResult(reviewManualConstructionDraftU2(proposal.ok ? proposal.parts : [],settings()));
  };
  const showPreview = () => {
    if (!result?.ok || typeof onShowPreview !== 'function') return;
    const target = Object.fromEntries(AXES.map(axis=>[axis,Number(previewDimensions[axis])]));
    // Empty string must NEVER become 0 silently.
    if (AXES.some(axis=>!String(previewDimensions[axis] ?? '').trim())) {
      setPreviewError('Enter Width, Height and Depth in whole millimeters.');return;
    }
    const planned = planUniversalManualAdminPreviewU3(proposal.parts, settings(), target);
    if (!planned.ok) {setPreviewError(`${planned.code}: ${planned.error}`);return;}
    setPreviewError(null);
    onShowPreview({ parts:planned.parts, dimensions:planned.dimensions,
      previewOnly:true, customerResizable:false });
    setOpen(false);
  };
  return <>
    <div style={{background:'#111827',color:'#cbd5e1',padding:'5px 15px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #334155',flexWrap:'wrap'}}>
      <button type="button" style={action} onClick={()=>setOpen(true)}>
        Manual Construction Review (U2)
      </button>
      <span style={{fontSize:11}}>Admin-only draft • {total} physical parts • No Save/Publish/Customer permission</span>
    </div>
    {open && <div role="presentation" style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div role="dialog" aria-modal="true" aria-label="Manual Construction Review" style={{background:'#111827',color:'#e2e8f0',border:'1px solid #475569',borderRadius:4,maxWidth:980,width:'100%',maxHeight:'92vh',overflowY:'auto',padding:17,boxShadow:'0 10px 40px #0009'}}>
        <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:5}}>Universal Manual Construction — U2 Review</div>
            <div style={{fontSize:12,color:'#fbbf24',lineHeight:1.5}}>
              Suggested rules are not verified. Admin must inspect each physical part and contact. Passing geometry preview is NOT joinery approval or Customer permission.
            </div>
          </div>
          <button type="button" style={action} onClick={()=>setOpen(false)} aria-label="Close construction review">Close</button>
        </div>
        {!proposal.ok ? <div role="alert" style={{marginTop:20,color:'#fca5a5'}}>{proposal.error}</div> : <>
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',fontSize:12}}>
            <span><b>Original:</b> {AXES.map(axis=>`${axis[0].toUpperCase()}: ${Math.round(proposal.bounds[axis].size)} mm`).join(' · ')}</span>
            <span><b>Reviewed:</b> {confirmed.length}/{total} parts</span>
          </div>
          <div style={{marginTop:15,padding:10,border:'1px solid #334155',borderRadius:3}}>
            <div style={heading}>1. Enter Admin-reviewed test range (mm)</div>
            <div style={{fontSize:11,color:'#94a3b8',marginBottom:10}}>Initial ±10% values are suggestions only. Review the actual joint clearances and furniture limits; adjust before checking. Geometry extremes are tested, not certified.</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10}}>
              {AXES.map(axis=><div key={axis}>
                <div style={{...label,textTransform:'capitalize'}}>{axis} (original {Math.round(proposal.bounds[axis].size)})</div>
                <div style={{display:'flex',gap:6}}>
                  {['min','max'].map(bound=><label key={bound} style={{flex:1,fontSize:10}}>{bound}
                    <input aria-label={`${axis} ${bound} limit`} type="number" step="1" style={field} value={limits[axis]?.[bound] ?? ''} onChange={e=>setRange(axis,bound,e.target.value)} />
                  </label>)}
                </div>
              </div>)}
            </div>
          </div>
          <div style={{marginTop:14,padding:10,border:'1px solid #334155',borderRadius:3}}>
            <div style={heading}>2. Select and confirm every physical part</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'start'}}>
              <div style={{width:250,maxHeight:280,overflowY:'auto',display:'grid',gap:4}}>
                {proposal.parts.map(p=>{const id=String(p.id);return <button key={id} type="button" onClick={()=>setSelected(id)} style={{...action,textAlign:'left',background:id===selected?'#1d4ed8':'#1e293b',padding:8}}>
                  {confirmed.includes(id)?'✓ ':'○ '}{p.partCode || id} — {p.label || p.partRole || p.type}
                </button>})}
              </div>
              <div style={{flex:'1 1 330px',minWidth:0}}>
                {selectedPart && <>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{selectedPart.partCode || selectedPart.id} · {selectedPart.label || selectedPart.type}</div>
                  <div style={{fontSize:11,color:'#94a3b8',marginBottom:10}}>Set where each physical edge follows the whole furniture frame. A pair using the same anchor preserves that part's thickness/section along that axis.</div>
                  {AXES.map(axis=><div key={axis} style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr',gap:8,alignItems:'end',marginBottom:10}}>
                    <strong style={{textTransform:'capitalize',fontSize:11,paddingBottom:8}}>{axis}</strong>
                    {EDGES.map(edge=><label style={label} key={edge}>{edge} edge
                      <select aria-label={`${selectedPart.partCode || selectedPart.id} ${axis} ${edge}`} style={{...dark,width:'100%',fontSize:11}} value={rules[String(selectedPart.id)]?.[axis]?.[edge] ?? ''} onChange={e=>setEdge(String(selectedPart.id),axis,edge,e.target.value)}>
                        {U2_RULE_CHOICES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>)}
                  </div>)}
                  <label style={{display:'flex',alignItems:'start',gap:7,fontSize:12,lineHeight:1.5,color:'#f8fafc',padding:'8px 0'}}>
                    <input type="checkbox" checked={confirmed.includes(String(selectedPart.id))} onChange={e=>{const id=String(selectedPart.id);setConfirmed(prev=>e.target.checked?[...prev,id]:prev.filter(x=>x!==id));setResult(null);setPreviewError(null);onInvalidateReviewed?.()}} />
                    I inspected this part's six edge rules, dimensions, and physical attachments (Admin review, not engineering certification).
                  </label>
                </>}
              </div>
            </div>
          </div>
          <div style={{marginTop:15,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <button type="button" style={{...action,background:'#2563eb',color:'white',padding:'10px 14px'}} onClick={check}>Validate Draft Geometry (8 range corners)</button>
            <span style={{fontSize:11,color:'#fbbf24'}}>No geometry or database mutation.</span>
          </div>
          {result?.ok && typeof onStageReviewed === 'function' && <div style={{marginTop:14,padding:12,border:'1px solid #334155'}}>
            <div style={heading}>U4 — Stage reviewed geometry for next Save</div>
            <div style={{fontSize:11,color:'#fbbf24',lineHeight:1.5,marginBottom:9}}>
              Your next Save will ask the backend to re-check all 8 geometry corners and bind the review to this exact part list. No Customer permission or carpentry certification.
            </div>
            <button type="button" style={{...action,background:'#2563eb',color:'#fff',padding:'10px 14px'}} onClick={()=>onStageReviewed(settings())}>
              Stage geometry review for Save
            </button>
          </div>}
          {result?.ok && typeof onShowPreview === 'function' && <div style={{marginTop:14,padding:12,border:'1px solid #334155'}}>
            <div style={heading}>3. Preview reviewed dimensions in Admin 3D (U3)</div>
            <div style={{color:'#fbbf24',fontSize:11,marginBottom:10}}>Preview only: the live design, Undo, Save and Publish remain unchanged. Exit preview to restore the original scene.</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
              {AXES.map(axis=><label key={axis} style={{fontSize:11,textTransform:'capitalize'}}>{axis} (mm)
                <input type="number" step="1" aria-label={`U3 preview ${axis}`} style={{...dark,display:'block',width:108,marginTop:4}}
                  value={previewDimensions[axis] ?? ''} onChange={e=>{setPreviewDimensions(old=>({...old,[axis]:e.target.value}));setPreviewError(null)}} />
              </label>)}
              <button type="button" style={{...action,background:'#2563eb',color:'#fff',padding:'10px 14px'}} onClick={showPreview}>
                View temporary 3D preview
              </button>
            </div>
            {previewError && <div role="alert" style={{color:'#fca5a5',marginTop:9,fontSize:12}}>{previewError}</div>}
          </div>}
          {result && <div role="status" style={{marginTop:12,padding:12,border:'1px solid #475569',fontSize:12,lineHeight:1.6,color:result.ok?'#86efac':'#fca5a5'}}>
            {result.ok
              ? `U2 PREVIEW PASS: ${result.partCount} parts; ${result.cornerChecks} corner combinations. Draft only — not saved, not approved, Customer still Size Protected.`
              : `U2 REVIEW BLOCKED [${result.code}]: ${result.error}`}
          </div>}
        </>}
      </div>
    </div>}
  </>;
}
