// src/pages/backup/BackupPage.jsx – Database Backup Management (Admin)
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function BackupPage() {
  const [logs,      setLogs]     = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [triggering,setTrigger]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/backup/logs');
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const triggerBackup = async () => {
    if (!window.confirm('Run a manual database backup now?')) return;
    setTrigger(true);
    try {
      const { data } = await api.post('/backup/trigger');
      toast.success(`Backup completed! File: ${data.file} (${data.size_kb} KB)`);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Backup failed. Check server logs.';
      toast.error(msg, { duration: 6000 });
    } finally {
      setTrigger(false);
    }
  };

  const successCount = logs.filter(l => l.status === 'success').length;
  const failCount    = logs.filter(l => l.status === 'failed').length;
  const lastSuccess  = logs.find(l => l.status === 'success');

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={pageTitle}>Database Backup</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Automated backups run twice daily (12:00 AM and 12:00 PM). Trigger a manual backup anytime.
          </p>
        </div>
        <button onClick={triggerBackup} disabled={triggering} style={btnPrimary}>
          {triggering ? '⏳ Running Backup...' : '🗄️ Run Backup Now'}
        </button>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Backups"   value={logs.length}    color="#3b82f6" icon="🗄️" />
        <StatCard label="Successful"      value={successCount}   color="#10b981" icon="✅" />
        <StatCard label="Failed"          value={failCount}      color="#ef4444" icon="❌" alert={failCount > 0} />
        <StatCard
          label="Last Successful"
          value={lastSuccess ? new Date(lastSuccess.created_at).toLocaleDateString('en-PH') : 'None'}
          color="#8b5cf6" icon="🕐"
        />
      </div>

      {/* ── Schedule Info ────────────────────────────────────────── */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#1e40af' }}>
        <strong>📅 Automated Schedule:</strong>&nbsp;
        Backups are automatically triggered at <strong>12:00 AM</strong> and <strong>12:00 PM</strong> daily via server cron job.
        Files are saved to the <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>/backups</code> directory on the server.
      </div>

      {/* ── Logs Table ───────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e2a38' }}>Backup History</h3>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{logs.length} records</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {['#', 'Type', 'Filename', 'File Size', 'Status', 'Triggered By', 'Date & Time', 'Download'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={centerCell}>Loading backup logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} style={centerCell}>No backup records yet. Run a backup to get started.</td></tr>
            ) : logs.map((log, i) => {
              const isSuccess = log.status === 'success';
              const sizeMB    = log.file_size ? (log.file_size >= 1024 ? (log.file_size / 1024).toFixed(2) + ' MB' : log.file_size + ' KB') : '—';
              return (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                  <td style={td}>
                    <span style={{
                      background: log.type === 'auto' ? '#e9d5ff' : '#dbeafe',
                      color:      log.type === 'auto' ? '#6b21a8' : '#1e40af',
                      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    }}>
                      {log.type === 'auto' ? '⏰ Auto' : '🖐 Manual'}
                    </span>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                    {log.filename || '—'}
                  </td>
                  <td style={td}>{sizeMB}</td>
                  <td style={td}>
                    <span style={{
                      background: isSuccess ? '#d1fae5' : '#fee2e2',
                      color:      isSuccess ? '#065f46' : '#991b1b',
                      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    }}>
                      {isSuccess ? '✅ Success' : '❌ Failed'}
                    </span>
                    {!isSuccess && log.error_message && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                        {log.error_message.slice(0, 60)}
                      </div>
                    )}
                  </td>
                  <td style={td}>{log.triggered_by || 'System'}</td>
                  <td style={{ ...td, fontSize: 12, color: '#64748b' }}>
                    {new Date(log.created_at).toLocaleString('en-PH')}
                  </td>
                  <td style={td}>
                    {isSuccess && log.file_url ? (
                      <a href={log.file_url} download style={dlBtn}>⬇ Download</a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon, alert }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      borderLeft: `4px solid ${alert ? '#ef4444' : color}`,
      boxShadow: '0 1px 6px rgba(0,0,0,.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11, color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: alert ? '#ef4444' : '#1e2a38', margin: '6px 0 0' }}>{value}</p>
        </div>
        <span style={{ fontSize: 24 }}>{icon}</span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageTitle  = { fontSize: 22, fontWeight: 700, color: '#1e2a38', margin: 0 };
const card       = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflow: 'hidden' };
const th         = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' };
const td         = { padding: '10px 14px', color: '#374151', verticalAlign: 'middle' };
const centerCell = { textAlign: 'center', padding: 40, color: '#94a3b8' };
const btnPrimary = { padding: '9px 22px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const dlBtn      = { padding: '4px 12px', background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' };
