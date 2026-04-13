/**
 * Frontend API helpers for the Febo Dashboard.
 * In development, requests are proxied via Vite.
 * In production, we use VITE_BACKEND_URL if provided.
 */

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

export const fetchConfig = async () => {
  const response = await fetch(`${API_BASE}/api/config`);
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
};

export const fetchStatus = async () => {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) throw new Error('Failed to fetch status');
  return response.json();
};

export const checkHealth = async () => {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Backend connection failed');
  }
  return response.json();
};

export const fetchEvents = async () => {
  const response = await fetch(`${API_BASE}/api/events`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to fetch events');
  }
  return response.json();
};

export const fetchSummary = async (eventId) => {
  const response = await fetch(`${API_BASE}/api/summarize?eventId=${encodedURIComponent(eventId)}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Summarization failed');
  }
  return response.json();
};

export const createManualEvent = async (eventId) => {
  const response = await fetch(`${API_BASE}/api/events/manual`, {
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
