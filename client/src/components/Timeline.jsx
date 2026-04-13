import React, { useState } from 'react';

const CronGroup = ({ items, formatTime, chunkIndex }) => {
  const [isOpen, setIsOpen] = useState(false);
  const count = items.length;
  const startTime = formatTime(items[0].timestamp);
  const endTime = formatTime(items[items.length - 1].timestamp);
  
  return (
    <div className="tl-cron-group" style={{ animationDelay: `${chunkIndex * 0.05}s` }}>
      <button className="tl-cron-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="tl-cron-summary-text">
          <span className="tl-cron-icon">⏰</span>
          {count} Background Check{count > 1 ? 's' : ''} ({startTime} - {endTime})
        </div>
        <div className={`tl-cron-arrow ${isOpen ? 'open' : ''}`}>▼</div>
      </button>
      
      {isOpen && (
        <div className="tl-cron-content">
          {items.map(event => (
            <div key={event.eventId} className="tl-row tl-cron-row">
              <span className="tl-time">{formatTime(event.timestamp)}</span>
              <span className="tl-dot tl-cron-dot" />
              <span className="tl-text tl-cron-text">{event.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Timeline = ({ events, processing, onRefresh }) => {
  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Only show events that have summaries
  const summarized = events.filter(e => e.summary);

  // Group by date
  const grouped = {};
  summarized.forEach(e => {
    const key = formatDate(e.timestamp);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  const stageLabel = {
    recording: '📹 Capturing video…',
    analyzing: '🤖 AI is analyzing footage…',
  };

  const now = new Date();
  const nowTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="tl-root">
      <div className="tl-header">
        <h2>🐾 Activity Timeline</h2>
        <button className="btn btn-sm" onClick={onRefresh}>🔄</button>
      </div>

      <div className="tl-scroll">
        {/* Live processing indicator */}
        {processing && (
          <div className="tl-day">
            <div className="tl-date">Now</div>
            <div className="tl-entries">
              <div className="tl-row tl-processing">
                <span className="tl-time">{nowTime}</span>
                <span className="tl-dot tl-dot-pulse" />
                <span className="tl-text tl-text-loading">
                  {stageLabel[processing.stage] || 'Processing…'}
                </span>
                <div className="tl-progress-bar">
                  <div className={`tl-progress-fill stage-${processing.stage}`} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summarized events */}
        {summarized.length === 0 && !processing ? (
          <div className="tl-empty">
            <span>😴</span>
            <p>No activity yet. Waiting for Febo…</p>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, dateEvents]) => {
            // Chunk consecutive cron events
            const chunks = [];
            let currentCronChunk = null;
            
            dateEvents.forEach(event => {
              if (event.type === 'cron') {
                if (!currentCronChunk) {
                  currentCronChunk = { type: 'cron_group', items: [] };
                  chunks.push(currentCronChunk);
                }
                currentCronChunk.items.push(event);
              } else {
                currentCronChunk = null;
                chunks.push(event);
              }
            });

            return (
              <div key={dateLabel} className="tl-day">
                <div className="tl-date">{dateLabel}</div>
                <div className="tl-entries">
                  {chunks.map((chunk, i) => {
                    if (chunk.type === 'cron_group') {
                      return <CronGroup key={`group-${dateLabel}-${i}`} items={chunk.items} formatTime={formatTime} chunkIndex={i} />;
                    }
                    return (
                      <div key={chunk.eventId} className="tl-row" style={{ animationDelay: `${i * 0.05}s` }}>
                        <span className="tl-time">{formatTime(chunk.timestamp)}</span>
                        <span className="tl-dot" />
                        <span className="tl-text">{chunk.summary}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .tl-root {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        .tl-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
          flex-shrink: 0;
        }
        .tl-header h2 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .tl-scroll {
          overflow-y: auto;
          flex: 1;
          padding-right: 0.5rem;
          padding-bottom: 2rem;
        }
        .tl-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          color: var(--text-muted);
          gap: 0.5rem;
          padding-top: 4rem;
        }
        .tl-empty span {
          font-size: 2.5rem;
        }

        /* Date group */
        .tl-day {
          margin-bottom: 1.5rem;
        }
        .tl-date {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--accent);
          margin-bottom: 0.75rem;
          padding-left: 5.5rem;
        }

        /* Entry row */
        .tl-entries {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .tl-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          background: var(--bg-card);
          border: 1px solid transparent;
          transition: var(--transition);
          animation: fadeIn 0.3s ease-out both;
          flex-wrap: wrap;
        }
        .tl-row:hover {
          border-color: rgba(245, 158, 11, 0.2);
          background: var(--bg-card-hover);
        }
        .tl-time {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          width: 4.5rem;
          flex-shrink: 0;
          text-align: right;
        }
        .tl-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
          box-shadow: 0 0 6px var(--accent-glow);
        }
        .tl-text {
          font-size: 0.9rem;
          color: var(--text-primary);
          line-height: 1.4;
        }

        /* Cron Collapsible Group */
        .tl-cron-group {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px dashed rgba(255, 255, 255, 0.1);
          margin-bottom: 0.2rem;
          overflow: hidden;
          animation: fadeIn 0.3s ease-out both;
        }
        .tl-cron-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.65rem 1rem;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.85rem;
          transition: background 0.2s;
        }
        .tl-cron-header:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }
        .tl-cron-summary-text {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .tl-cron-icon {
          font-size: 1rem;
        }
        .tl-cron-arrow {
          font-size: 0.7rem;
          transition: transform 0.2s;
        }
        .tl-cron-arrow.open {
          transform: rotate(180deg);
        }
        .tl-cron-content {
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(0,0,0,0.1);
        }
        .tl-cron-row {
          background: transparent;
          border-radius: 0;
        }
        .tl-cron-row:hover {
          background: rgba(255,255,255,0.03);
          border: 1px solid transparent; /* Override parent hover border */
        }
        .tl-cron-text {
          color: #9ca3af; /* Distinct grayed-out look for cron events */
          font-size: 0.85rem;
        }
        .tl-cron-dot {
          background: #4b5563;
          box-shadow: none;
        }

        /* Processing state */
        .tl-processing {
          border-color: rgba(245, 158, 11, 0.3);
          background: rgba(245, 158, 11, 0.04);
        }
        .tl-dot-pulse {
          width: 8px;
          height: 8px;
          animation: dotPulse 1.2s ease-in-out infinite;
        }
        .tl-text-loading {
          color: var(--accent);
          font-weight: 500;
        }
        .tl-progress-bar {
          width: 100%;
          height: 3px;
          background: var(--border);
          border-radius: 3px;
          margin-top: 0.25rem;
          overflow: hidden;
        }
        .tl-progress-fill {
          height: 100%;
          border-radius: 3px;
          background: var(--accent);
          transition: width 0.5s ease;
        }
        .tl-progress-fill.stage-recording {
          width: 33%;
          animation: progressPulse 1.5s ease-in-out infinite;
        }
        .tl-progress-fill.stage-uploading {
          width: 66%;
          animation: progressPulse 1s ease-in-out infinite;
        }
        .tl-progress-fill.stage-analyzing {
          width: 90%;
          animation: progressPulse 2s ease-in-out infinite;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(1.5); }
        }
        @keyframes progressPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default Timeline;
