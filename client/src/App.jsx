import React, { useState, useEffect, useRef } from 'react';
import { checkHealth, fetchEvents, fetchConfig, createManualEvent, fetchStatus } from './api';
import Timeline from './components/Timeline';

const App = () => {
  const [appState, setAppState] = useState('loading');
  const [configError, setConfigError] = useState(null);
  const [events, setEvents] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [watcherStatus, setWatcherStatus] = useState(null);
  const [timeUntilCronMs, setTimeUntilCronMs] = useState(null);
  
  // Processing progress: null | { stage: 'analyzing', eventId }
  const [processing, setProcessing] = useState(null);
  const processedEventIds = useRef(new Set());

  // Initial setup
  useEffect(() => {
    const startup = async () => {
      try {
        await checkHealth();
        const cfg = await fetchConfig();
        setDeviceId(cfg.deviceId);

        const data = await fetchEvents();
        setEvents(data.events);
        data.events.forEach(e => processedEventIds.current.add(e.eventId));
        
        const status = await fetchStatus();
        setWatcherStatus(status);

        setAppState('ready');
      } catch (err) {
        setConfigError(err.message);
        setAppState('error');
      }
    };
    startup();
  }, []);

  // Poll for new Google Home events
  useEffect(() => {
    if (appState !== 'ready') return;

    const interval = setInterval(async () => {
      try {
        const status = await fetchStatus();
        setWatcherStatus(status);
        
        const data = await fetchEvents();
        const newEvents = data.events.filter(e => !processedEventIds.current.has(e.eventId));

        if (newEvents.length > 0) {
          console.log(`🔔 ${newEvents.length} new event(s) detected from Google Home!`);
          const latest = newEvents[0];
          processedEventIds.current.add(latest.eventId);
          setEvents(data.events);
        }
      } catch (err) {
        console.warn('Polling failed:', err.message);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [appState]);

  // Local tick for the countdown timer without hitting the server every second
  useEffect(() => {
    if (!watcherStatus?.nextCronTime) return;
    
    const tick = () => {
      const remaining = watcherStatus.nextCronTime - Date.now();
      setTimeUntilCronMs(Math.max(0, remaining));
    };
    
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [watcherStatus?.nextCronTime]);

  const formatCountdown = (ms) => {
    if (ms === null) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleRefreshEvents = async () => {
    try {
      const data = await fetchEvents();
      setEvents(data.events);
    } catch (err) {
      console.error('Refresh failed:', err.message);
    }
  };

  const triggerManualAnalysis = async () => {
    const manualId = `manual-${Date.now()}`;
    setProcessing({ stage: 'analyzing', eventId: manualId });
    try {
      console.log('Sending manual analysis request to backend...');
      await createManualEvent(manualId);
      await handleRefreshEvents();
    } catch (err) {
      console.error('Manual analysis failed:', err);
    }
    setProcessing(null);
  };

  // Loading screen
  if (appState === 'loading' && events.length === 0) {
    return (
      <div className="app-splash">
        <div className="spinner">🐱</div>
        <p>INITIALIZING FEBO DASHBOARD…</p>
      </div>
    );
  }

  // Error screen
  if (appState === 'error') {
    return (
      <div className="app-splash">
        <div className="card app-error-card">
          <h2>Configuration Error</h2>
          <p>{configError}</p>
          <button className="btn" onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <header>
        <h1><span>🐱</span> What Is Febo Doing?</h1>
        <div className="header-status">
          <div className="header-status-label">Status</div>
          <div className="header-status-value">● Active Monitoring</div>
        </div>
      </header>

      <main className="app-main">
        <div className="monitor-panel">
          <div className="card prompt-card">
             <h3>🤖 Smart Watcher Active</h3>
             <p>The backend server is silently monitoring your camera 24/7. It will automatically log events when motion is detected.</p>
             
             {watcherStatus && (
               <div className="cron-status">
                 <div className="cron-label">Next automatic check in:</div>
                 <div className="cron-timer">{formatCountdown(timeUntilCronMs)}</div>
               </div>
             )}
             
             <button 
               className="btn prompt-btn" 
               onClick={triggerManualAnalysis}
               disabled={!!processing}
             >
               {processing ? '⏳ Analyzing 10s Clip...' : '📹 Analyze Video Now'}
             </button>
          </div>
        </div>

        <Timeline
          events={events}
          processing={processing || (watcherStatus?.isProcessing ? { stage: watcherStatus.processingStage } : null)}
          onRefresh={handleRefreshEvents}
        />
      </main>

      <style>{`
        .app-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        .app-main {
          display: flex;
          flex: 1;
          padding: 1.5rem;
          gap: 1.5rem;
          min-height: 0;
          overflow: hidden;
        }
        .monitor-panel {
          width: 380px;
          flex-shrink: 0;
          align-self: flex-start;
          position: sticky;
          top: 0;
        }
        .prompt-card {
          padding: 1.5rem;
          border-left: 4px solid var(--accent);
          background: var(--surface-light);
        }
        .prompt-card h3 {
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .prompt-card p {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }
        .cron-status {
          background: rgba(0,0,0,0.2);
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        .cron-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.3rem;
        }
        .cron-timer {
          font-size: 1.5rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--success);
        }
        .prompt-btn {
          width: 100%;
          background: var(--accent);
          color: #000;
          font-weight: 600;
          padding: 0.8rem;
          border-radius: 6px;
        }
        .prompt-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .app-main > .timeline-root {
          flex: 1;
          min-height: 0;
        }
        .app-splash {
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
          color: var(--accent);
          text-align: center;
          gap: 1rem;
        }
        .app-splash p {
          font-weight: 600;
          letter-spacing: 1px;
        }
        .app-error-card {
          max-width: 460px;
          padding: 2.5rem;
          text-align: center;
          border-top: 4px solid var(--danger);
        }
        .app-error-card h2 {
          color: var(--danger);
          margin-bottom: 0.75rem;
        }
        .app-error-card p {
          color: var(--text-primary);
          margin-bottom: 1.5rem;
        }
        .header-status {
          text-align: right;
        }
        .header-status-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .header-status-value {
          font-size: 0.9rem;
          color: var(--success);
          font-weight: 600;
        }
        .spinner {
          font-size: 3rem;
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

export default App;
