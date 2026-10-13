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
        Furniture Size Review
      </button>
      <span style={{fontSize:11}}>Draft design • {total} parts • Check size rules before saving</span>
    </div>
    {open && <div role="presentation" style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div role="dialog" aria-modal="true" aria-label="Manual Construction Review" style={{background:'#111827',color:'#e2e8f0',border:'1px solid #475569',borderRadius:4,maxWidth:980,width:'100%',maxHeight:'92vh',overflowY:'auto',padding:17,boxShadow:'0 10px 40px #0009'}}>
        <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:5}}>Review Furniture Resizing</div>
            <div style={{fontSize:12,color:'#fbbf24',lineHeight:1.5}}>
              Check how each part follows changes in furniture size. A successful preview does not confirm build safety or automatically allow customer resizing.
            </div>
          </div>
          <button type="button" style={action} onClick={()=>setOpen(false)} aria-label="Close construction review">Close</button>
        </div>
        {!proposal.ok ? <div role="alert" style={{marginTop:20,color:'#fca5a5'}}>{proposal.error}</div> : <>
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',fontSize:12}}>
            <span><b>Current size:</b> {AXES.map(axis=>`${axis[0].toUpperCase()}: ${Math.round(proposal.bounds[axis].size)} mm`).join(' · ')}</span>
            <span><b>Parts checked:</b> {confirmed.length}/{total} parts</span>
          </div>
          <div style={{marginTop:15,padding:10,border:'1px solid #334155',borderRadius:3}}>
            <div style={heading}>1. Set allowed furniture sizes (mm)</div>
            <div style={{fontSize:11,color:'#94a3b8',marginBottom:10}}>The suggested limits are a starting point. Set the smallest and largest safe sizes for this furniture, then run the size test. The test does not replace a real construction check.</div>
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
            <div style={heading}>2. Check each furniture part</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'start'}}>
              <div style={{width:250,maxHeight:280,overflowY:'auto',display:'grid',gap:4}}>
                {proposal.parts.map(p=>{const id=String(p.id);return <button key={id} type="button" onClick={()=>setSelected(id)} style={{...action,textAlign:'left',background:id===selected?'#1d4ed8':'#1e293b',padding:8}}>
                  {confirmed.includes(id)?'✓ ':'○ '}{p.partCode || id} — {p.label || p.partRole || p.type}
                </button>})}
              </div>
              <div style={{flex:'1 1 330px',minWidth:0}}>
                {selectedPart && <>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{selectedPart.partCode || selectedPart.id} · {selectedPart.label || selectedPart.type}</div>
                  <div style={{fontSize:11,color:'#94a3b8',marginBottom:10}}>For Width, Height, and Depth, choose where each side stays attached as the furniture changes size. Choosing the same position for both sides keeps that part's size along that direction.</div>
                  {AXES.map(axis=><div key={axis} style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr',gap:8,alignItems:'end',marginBottom:10}}>
                    <strong style={{textTransform:'capitalize',fontSize:11,paddingBottom:8}}>{axis}</strong>
                    {EDGES.map(edge=><label style={label} key={edge}>{edge === 'start' ? 'Start side' : 'End side'}
                      <select aria-label={`${selectedPart.partCode || selectedPart.id} ${axis} ${edge}`} style={{...dark,width:'100%',fontSize:11}} value={rules[String(selectedPart.id)]?.[axis]?.[edge] ?? ''} onChange={e=>setEdge(String(selectedPart.id),axis,edge,e.target.value)}>
                        {U2_RULE_CHOICES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>)}
                  </div>)}
                  <label style={{display:'flex',alignItems:'start',gap:7,fontSize:12,lineHeight:1.5,color:'#f8fafc',padding:'8px 0'}}>
                    <input type="checkbox" checked={confirmed.includes(String(selectedPart.id))} onChange={e=>{const id=String(selectedPart.id);setConfirmed(prev=>e.target.checked?[...prev,id]:prev.filter(x=>x!==id));setResult(null);setPreviewError(null);onInvalidateReviewed?.()}} />
                    I checked this part's dimensions, position, and resizing behavior.
                  </label>
                </>}
              </div>
            </div>
          </div>
          <div style={{marginTop:15,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <button type="button" style={{...action,background:'#2563eb',color:'white',padding:'10px 14px'}} onClick={check}>Test All Size Limits</button>
            <span style={{fontSize:11,color:'#fbbf24'}}>Test only — no changes saved.</span>
          </div>
          {result?.ok && typeof onStageReviewed === 'function' && <div style={{marginTop:14,padding:12,border:'1px solid #334155'}}>
            <div style={heading}>3. Confirm size settings</div>
            <div style={{fontSize:11,color:'#fbbf24',lineHeight:1.5,marginBottom:9}}>
              Click Confirm, then Save the blueprint to store these reviewed size settings. Saving does not automatically enable customer resizing.
            </div>
            <button type="button" style={{...action,background:'#2563eb',color:'#fff',padding:'10px 14px'}} onClick={()=>onStageReviewed(settings())}>
              Confirm Settings for Save
            </button>
          </div>}
          {result?.ok && typeof onShowPreview === 'function' && <div style={{marginTop:14,padding:12,border:'1px solid #334155'}}>
            <div style={heading}>4. Preview the resized furniture</div>
            <div style={{color:'#fbbf24',fontSize:11,marginBottom:10}}>Try a different Width, Height and Depth without changing your original design. Exit preview to return to editing.</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
              {AXES.map(axis=><label key={axis} style={{fontSize:11,textTransform:'capitalize'}}>{axis} (mm)
                <input type="number" step="1" aria-label={`U3 preview ${axis}`} style={{...dark,display:'block',width:108,marginTop:4}}
                  value={previewDimensions[axis] ?? ''} onChange={e=>{setPreviewDimensions(old=>({...old,[axis]:e.target.value}));setPreviewError(null)}} />
              </label>)}
              <button type="button" style={{...action,background:'#2563eb',color:'#fff',padding:'10px 14px'}} onClick={showPreview}>
                Preview Resized Furniture
              </button>
            </div>
            {previewError && <div role="alert" style={{color:'#fca5a5',marginTop:9,fontSize:12}}>{previewError}</div>}
          </div>}
          {result && <div role="status" style={{marginTop:12,padding:12,border:'1px solid #475569',fontSize:12,lineHeight:1.6,color:result.ok?'#86efac':'#fca5a5'}}>
            {result.ok
              ? `Size test passed: ${result.partCount} parts checked across ${result.cornerChecks} size combinations. Settings are not saved yet.`
              : `Size test needs attention: ${result.error}`}
          </div>}
        </>}
      </div>
    </div>}
  </>;
}
