/**
 * Frontend API helpers for the Febo Dashboard.
 * All requests are proxied via Vite to http://localhost:3000.
 */

export const fetchConfig = async () => {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
};

export const checkHealth = async () => {
  const response = await fetch('/api/health');
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Backend connection failed');
  }
  return response.json();
};

export const fetchEvents = async () => {
  const response = await fetch('/api/events');
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to fetch events');
  }
  return response.json();
};

export const fetchSummary = async (eventId) => {
  const response = await fetch(`/api/summarize?eventId=${encodedURIComponent(eventId)}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Summarization failed');
  }
  return response.json();
};

export const createManualEvent = async (eventId) => {
  const response = await fetch('/api/events/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId })
  });
  if (!response.ok) throw new Error('Failed to create manual event');
  return response.json();
};

function encodedURIComponent(str) {
  return encodeURIComponent(str);
}
