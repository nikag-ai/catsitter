import React from 'react';

const EventList = ({ events, selectedEventId, onSelectEvent, loading, onRefresh }) => {
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDayLabel = (isoString) => {
    const date = new Date(isoString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'person': return '👤';
      case 'sound': return '🔊';
      default: return '🏃';
    }
  };

  return (
    <div className="event-list-container" style={{ display: 'flex', flexDirection: 'column', width: '350px', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Recent Events</h2>
        <button className="btn" onClick={onRefresh} disabled={loading} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>
          🔄 Refresh
        </button>
      </div>

      <div className="event-scroll" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
        {events.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>😴</p>
            <p>Febo has been keeping a low profile.</p>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.eventId}
              className={`card event-card ${selectedEventId === event.eventId ? 'selected' : ''}`}
              onClick={() => !loading && onSelectEvent(event)}
              style={{
                padding: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: selectedEventId === event.eventId ? 'var(--accent)' : 'var(--border)',
                boxShadow: selectedEventId === event.eventId ? '0 0 15px var(--accent-glow)' : 'none',
                opacity: loading && selectedEventId !== event.eventId ? 0.6 : 1,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ 
                fontSize: '1.5rem', 
                background: 'rgba(245, 158, 11, 0.1)', 
                width: '45px', 
                height: '45px', 
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {getTypeIcon(event.type)}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{event.type}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getDayLabel(event.timestamp)}</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {formatTime(event.timestamp)}
                </div>
              </div>

              {event.previewUrl && (
                <div style={{
                  position: 'absolute',
                  right: '4px',
                  top: '4px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent)'
                }} title="Clip available"></div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventList;
