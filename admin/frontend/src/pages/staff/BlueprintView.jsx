import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, FileText, Eye, X } from 'lucide-react';
import { buildAssetUrl } from "../../services/api";

export default function BlueprintView() {
  const [blueprints, setBlueprints] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBlueprints = async (q = '') => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/pos/blueprints${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setBlueprints(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchBlueprints(); }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchBlueprints(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const openBlueprint = async (id) => {
    const res = await axios.get(`/api/pos/blueprints/${id}`);
    setSelected(res.data);
  };

  const stageColor = s => ({
    design:'badge-blue', estimation:'badge-yellow', approval:'badge-yellow',
    production:'badge-brown', delivery:'badge-blue', completed:'badge-green', archived:'badge-gray'
  }[s] || 'badge-gray');

  return (
    <div>
      <div className="page-header">
        <h1>Blueprint Management</h1>
        <p>View blueprints assigned to your projects (read-only)</p>
      </div>

      <div style={{ position:'relative', marginBottom:20 }}>
        <Search size={18} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#aaa' }} />
        <input
          type="text"
          placeholder="Search blueprints by title..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width:'100%', padding:'11px 14px 11px 42px', border:'1.5px solid #e0e0e0', borderRadius:10, fontSize:14, boxSizing:'border-box' }}
        />
      </div>

      {loading
        ? <p style={{ color:'#aaa', textAlign:'center', padding:40 }}>Loading blueprints...</p>
        : blueprints.length === 0
          ? <div className="card" style={{ textAlign:'center', padding:40, color:'#aaa' }}>No blueprints found.</div>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 }}>
              {blueprints.map(bp => (
                <div key={bp.id} className="card" style={{ cursor:'pointer', transition:'box-shadow 0.2s' }}
                  onClick={() => openBlueprint(bp.id)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'}
                >
                  {bp.thumbnail_url
                    ? <img
                        src={buildAssetUrl(bp.thumbnail_url)}
                        alt={bp.title}
                        style={{ width:'100%', height:120, objectFit:'cover', borderRadius:8, marginBottom:12 }}
                      />
                    : <div style={{ width:'100%', height:120, background:'#f7f3f0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12, fontSize:36 }}>📐</div>
                  }
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{bp.title}</div>
                  <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>{bp.description || 'No description'}</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <span className={`badge ${stageColor(bp.stage)}`}>{bp.stage}</span>
                    {bp.is_template && <span className="badge badge-blue">Template</span>}
                    {bp.is_gallery && <span className="badge badge-green">Gallery</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#aaa', marginTop:8 }}>
                    By {bp.creator_name} • {new Date(bp.created_at).toLocaleDateString('en-PH')}
                  </div>
                  <button className="btn btn-secondary" style={{ marginTop:10, width:'100%', justifyContent:'center' }}>
                    <Eye size={14} /> View Blueprint
                  </button>
                </div>
              ))}
            </div>
      }

      {/* Blueprint Detail Modal */}
      {selected && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20
        }}>
          <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'85vh', overflowY:'auto', padding:32 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <h2 style={{ fontWeight:800, fontSize:20, marginBottom:4 }}>{selected.title}</h2>
                <div style={{ display:'flex', gap:8 }}>
                  <span className={`badge ${stageColor(selected.stage)}`}>{selected.stage}</span>
                  {selected.is_template && <span className="badge badge-blue">Template</span>}
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>

            {selected.thumbnail_url && (
              <img
                src={buildAssetUrl(selected.thumbnail_url)}
                alt=""
                style={{ width:'100%', borderRadius:10, marginBottom:20 }}
              />
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              {[
                ['Description', selected.description || '—'],
                ['Creator', selected.creator_name],
                ['Client', selected.client_name || '—'],
                ['Source', selected.source],
                ['Created', new Date(selected.created_at).toLocaleDateString('en-PH')],
                ['Updated', new Date(selected.updated_at).toLocaleDateString('en-PH')],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#aaa', fontWeight:600, marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:13, color:'#333' }}>{val}</div>
                </div>
              ))}
            </div>

            {selected.components && selected.components.length > 0 && (
              <>
                <h4 style={{ fontWeight:700, marginBottom:10 }}>Components ({selected.components.length})</h4>
                <table className="data-table">
                  <thead>
                    <tr><th>Label</th><th>Type</th><th>W×H×D (mm)</th><th>Wood</th><th>Finish</th></tr>
                  </thead>
                  <tbody>
                    {selected.components.map(c => (
                      <tr key={c.id}>
                        <td>{c.label || '—'}</td>
                        <td>{c.component_type || '—'}</td>
                        <td>{c.width_mm}×{c.height_mm}×{c.depth_mm}</td>
                        <td>{c.wood_type || '—'}</td>
                        <td>{c.finish_color || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ marginTop:20, padding:'12px 16px', background:'#f7f3f0', borderRadius:8, fontSize:12, color:'#888' }}>
              📋 This is a read-only view. Contact admin to modify blueprints.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
