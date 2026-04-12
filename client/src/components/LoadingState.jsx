import React from 'react';

const LoadingState = () => {
  return (
    <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Media Skeleton */}
      <div className="skeleton" style={{ width: '100%', aspectRatio: '16/9', borderRadius: '12px' }}></div>
      
      {/* Summary Skeletons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="skeleton" style={{ width: '90%', height: '1rem' }}></div>
        <div className="skeleton" style={{ width: '80%', height: '1rem' }}></div>
        <div className="skeleton" style={{ width: '85%', height: '1rem' }}></div>
        <div className="skeleton" style={{ width: '40%', height: '1rem' }}></div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', color: 'var(--text-muted)' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="spinner">⏳</span> Asking Gemini about Febo...
        </p>
      </div>
      
      <style>{`
        .spinner {
          display: inline-block;
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingState;
