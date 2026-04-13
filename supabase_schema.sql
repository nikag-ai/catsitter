-- Create the main events table to replace events.json
CREATE TABLE events (
    event_id TEXT PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    type TEXT NOT NULL,
    preview_url TEXT,
    event_session_id TEXT,
    event_token TEXT,
    device_id TEXT,
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index the timestamp column descending since the dashboard heavily queries the latest events
CREATE INDEX idx_events_timestamp ON events (timestamp DESC);

-- (Optional) Enable Row Level Security (RLS) if you plan on querying this 
-- directly from the React Frontend later. 
-- For now, we interact with it exclusively via our Node backend using the Service Role Key.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create an internal policy allowing all operations (since backend handles auth)
CREATE POLICY "Allow full access to service role" ON events FOR ALL USING (true);
