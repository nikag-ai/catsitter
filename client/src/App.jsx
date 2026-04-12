import React, { useState, useEffect, useRef } from 'react';
import { checkHealth, fetchEvents, fetchSummary, fetchConfig } from './api';
import EventList from './components/EventList';
import SummaryPanel from './components/SummaryPanel';
import LiveMonitor from './components/LiveMonitor';

const App = () => {
  const [appState, setAppState] = useState('loading'); // 'loading', 'ready', 'error'
  const [configError, setConfigError] = useState(null);
  const [events, setEvents] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [sumError, setSumError] = useState(null);
  
  const liveMonitorRef = useRef(null);
  const processedEventIds = useRef(new Set());

  // Initial setup: health, config, and events
  useEffect(() => {
    const startup = async () => {
      try {
        await checkHealth();
        const cfg = await fetchConfig();
        setDeviceId(cfg.deviceId);
        
        const data = await fetchEvents();
        setEvents(data.events);
        
        // Mark existing events as "processed" so we don't auto-snap for history
        data.events.forEach(e => processedEventIds.current.add(e.eventId));
        
        setAppState('ready');
      } catch (err) {
        setConfigError(err.message);
        setAppState('error');
      }
    };
    startup();
  }, []);

  // Polling disabled as requested. 
  // Events will only refresh when manually triggered or on page load.

  const handleRefreshEvents = async () => {
    try {
      const data = await fetchEvents();
      setEvents(data.events);
    } catch (err) {
      console.error('Refresh failed:', err.message);
    }
  };

  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    setSummarizing(true);
    setSumError(null);
    setSummaryData(null);

    try {
      const data = await fetchSummary(event.eventId);
      setSummaryData(data);
    } catch (err) {
      setSumError(err.message);
    } finally {
      setSummarizing(false);
    }
  };

  if (appState === 'loading' && events.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: 'var(--accent)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐱</div>
          <p style={{ fontWeight: 600, letterSpacing: '1px' }}>INITIALIZING FEBO DASHBOARD...</p>
        </div>
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '3rem', textAlign: 'center', borderTop: '4px solid var(--danger)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--danger)' }}>Configuration Error</h2>
          <p style={{ color: 'var(--text-primary)', marginBottom: '2rem' }}>{configError}</p>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', textAlign: 'left', marginBottom: '2rem', fontSize: '0.9rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Troubleshooting steps:</p>
            <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-muted)' }}>
              <li>Check your <strong>.env</strong> file</li>
              <li>Ensure <strong>node server/index.js</strong> is running</li>
              <li>Verify Google OAuth refresh token hasn't expired</li>
            </ul>
          </div>
          <button className="btn" onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <header>
        <h1><span>🐱</span> What Is Febo Doing?</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--success)', fontWeight: 600 }}>● Active Monitoring</div>
          </div>
        </div>
      </header>

      <main className="app-container">
        <div className="sidebar">
          <LiveMonitor 
            ref={liveMonitorRef}
            deviceId={deviceId}
            onCapture={async (data) => {
              console.log('Capture finished:', data);
              // Refresh event list so the manual event appears
              await handleRefreshEvents();
              // Trigger summary for the new event
              const newEvent = { eventId: data.eventId, timestamp: new Date().toISOString() };
              handleSelectEvent(newEvent);
            }}
          />
          
          <EventList 
            events={events} 
            selectedEventId={selectedEvent?.eventId}
            onSelectEvent={handleSelectEvent}
            loading={summarizing}
            onRefresh={handleRefreshEvents}
          />
        </div>
        
        <SummaryPanel 
          event={selectedEvent}
          summaryData={summaryData}
          loading={summarizing}
          error={sumError}
        />
      </main>

      <style>{`
        .app-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        .app-container {
          display: grid;
          grid-template-columns: 400px 1fr !important;
          gap: 2rem;
          padding: 2rem;
          flex: 1;
          overflow: hidden;
        }
        .sidebar {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow-y: auto;
        }
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

export default App;
