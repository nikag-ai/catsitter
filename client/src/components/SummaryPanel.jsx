import React from 'react';
import LoadingState from './LoadingState';

const SummaryPanel = ({ event, summaryData, loading, error }) => {
  if (!event && !loading) {
    return (
      <div className="summary-empty" style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '3rem',
        textAlign: 'center',
        background: 'rgba(36, 32, 26, 0.3)',
        borderRadius: '20px',
        border: '2px dashed var(--border)'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem', filter: 'grayscale(0.5)' }}>🐱</div>
        <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Where's Febo?</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '300px' }}>
          Select an event from the list to see what Febo was up to.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="summary-content" style={{ flex: 1, padding: '1rem' }}>
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="summary-error" style={{ flex: 1, padding: '2rem' }}>
        <div className="card" style={{ padding: '2rem', borderLeft: '4px solid var(--danger)', background: 'rgba(239, 68, 68, 0.05)' }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Failed to summarize</h3>
          <p style={{ color: 'var(--text-primary)' }}>{error}</p>
          <button className="btn" onClick={() => window.location.reload()} style={{ marginTop: '1rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { summary, mediaUrl, mediaType, timestamp } = summaryData;
  const bullets = summary.split('\n').filter(line => line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().length > 0);

  return (
    <div className="summary-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto', paddingRight: '1rem' }}>
      {/* Media Player */}
      <div className="media-container" style={{ position: 'relative', width: '100%', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        {mediaType === 'video' ? (
          <video 
            src={mediaUrl} 
            controls 
            autoPlay 
            loop 
            muted 
            style={{ width: '100%', display: 'block' }}
          />
        ) : (
          <img 
            src={mediaUrl} 
            alt="Cat event snapshot" 
            style={{ width: '100%', display: 'block' }}
          />
        )}
        <div style={{ 
          position: 'absolute', 
          bottom: '1rem', 
          right: '1rem', 
          background: 'rgba(0,0,0,0.6)', 
          padding: '0.4rem 0.8rem', 
          borderRadius: '20px', 
          fontSize: '0.8rem', 
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {new Date(timestamp).toLocaleString()}
        </div>
      </div>

      {/* Summary Text */}
      <div className="summary-text-container" style={{ animation: 'fadeIn 0.5s ease-out' }}>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--accent)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ✨ Activity Report
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {bullets.map((bullet, idx) => (
            <div 
              key={idx} 
              style={{ 
                padding: '1.25rem', 
                background: 'var(--bg-card)', 
                borderRadius: '12px', 
                borderLeft: '3px solid var(--accent)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                animation: `slideIn 0.4s ease-out ${idx * 0.1}s both`
              }}
            >
              {bullet.replace(/^[•-]\s*/, '')}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default SummaryPanel;
