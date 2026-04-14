// src/components/ErrorBoundary.jsx – Catches uncaught runtime errors
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary] Uncaught runtime error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'Unknown error';
    const stack = this.state.error?.stack || '';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fef2f2', fontFamily: 'Inter, sans-serif', padding: 24,
      }}>
        <div style={{ maxWidth: 640, width: '100%', background: '#fff', borderRadius: 14, padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,.12)', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: '#991b1b', fontWeight: 700, margin: '0 0 8px', fontSize: 20 }}>
            Something went wrong
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px' }}>
            An unexpected error occurred. This is usually a frontend bug or a missing API response field.
          </p>

          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <code style={{ fontSize: 13, color: '#dc2626', wordBreak: 'break-word' }}>{msg}</code>
          </div>

          {stack && (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ fontSize: 12, color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>
                Show stack trace
              </summary>
              <pre style={{ fontSize: 11, color: '#475569', background: '#f8fafc', padding: 12, borderRadius: 6, overflowX: 'auto', marginTop: 8, whiteSpace: 'pre-wrap' }}>
                {stack}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '8px 20px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Reload Page
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null, info: null }); }}
              style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              Try to Recover
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
