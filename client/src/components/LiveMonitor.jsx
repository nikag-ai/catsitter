import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import axios from 'axios';
import { createManualEvent } from '../api';

/**
 * LiveMonitor Component
 * Handles WebRTC live streaming from Nest Camera and provides 
 * a way to capture snapshots from the video buffer.
 */
const LiveMonitor = forwardRef(({ deviceId, onCapture, autoStart = true }, ref) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pcRef = useRef(null);
  const [streamStatus, setStreamStatus] = useState('idle'); // 'idle', 'connecting', 'live', 'error'
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const mediaSessionIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    capture: async (eventId) => {
      if (streamStatus !== 'live') return null;
      return performCapture(eventId);
    },
    record: async (eventId) => {
      if (streamStatus !== 'live') return null;
      return performRecord(eventId);
    },
    start: () => startStream(),
    stop: () => stopStream()
  }));

  const performRecord = (eventId) => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      const stream = video?.srcObject;
      if (!stream) return reject('No stream available');

      try {
        setIsRecording(true);
        setCountdown(10);
        chunksRef.current = [];
        
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          setIsRecording(false);
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          
          try {
            console.log(`📹 Uploading 10s video for event ${eventId}...`);
            const response = await axios.post('/api/stream/upload-video', blob, {
              headers: { 
                'Content-Type': 'video/webm',
                'X-Event-Id': eventId 
              }
            });
            console.log('✅ Video saved:', response.data.filename);
            if (onCapture) onCapture({ eventId, ...response.data, type: 'video' });
            resolve(response.data);
          } catch (err) {
            console.error('❌ Video upload failed:', err);
            reject(err);
          }
        };

        // Start recording
        recorder.start();

        // Setup 10s timer
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              recorder.stop();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

      } catch (err) {
        setIsRecording(false);
        reject(err);
      }
    });
  };

  useEffect(() => {
    if (autoStart && deviceId) {
      startStream();
    }
    return () => stopStream();
  }, [deviceId, autoStart]);

  const startStream = async () => {
    if (!deviceId) return;
    try {
      setStreamStatus('connecting');
      setError(null);

      // 1. Create local PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // 2. Add transceivers in the EXACT order Google Nest requires:
      // 1. Audio
      // 2. Video
      // 3. Application (Data Channel)
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.createDataChannel('data'); // This adds the 'application' m-line

      // 3. Handle remote stream
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStreamStatus('live');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('🧊 ICE Connection State:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          setError('ICE connection failed. Ensure your network allows STUN/WebRTC.');
          setStreamStatus('error');
        }
      };

      // 4. Create local offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 5. Send offer to backend -> Google SDM
      const response = await axios.post('/api/stream/offer', {
        deviceId,
        offerSdp: offer.sdp
      });

      const { answerSdp, mediaSessionId } = response.data;
      mediaSessionIdRef.current = mediaSessionId;

      // 6. MANUALLY PATCH THE SDP ANSWER
      // Google Nest returns 'sendrecv' but modern browsers strictly require 'sendonly'
      // when the offer was 'recvonly'. Without this patch, setRemoteDescription fails.
      const patchedAnswerSdp = answerSdp.replace(/a=sendrecv/g, 'a=sendonly');

      // 7. Set remote answer
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: patchedAnswerSdp
      }));

      console.log('✅ WebRTC Handshake complete. Waiting for tracks...');

    } catch (err) {
      console.error('❌ WebRTC Start Error:', err);
      setError(err.response?.data?.error || err.message);
      setStreamStatus('error');
    }
  };

  const stopStream = async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamStatus('idle');

    // Notify backend to stop
    if (mediaSessionIdRef.current) {
      try {
        await axios.post('/api/stream/stop', {
          deviceId,
          mediaSessionId: mediaSessionIdRef.current
        });
      } catch (e) {
        console.warn('Failed to stop stream on backend:', e.message);
      }
      mediaSessionIdRef.current = null;
    }
  };

  const performCapture = async (eventId) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    // Draw frame to canvas
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);

    // Upload to server
    try {
      console.log(`📸 Uploading snapshot for event ${eventId}...`);
      const response = await axios.post('/api/stream/capture', {
        eventId,
        imageData
      });
      console.log('✅ Snapshot saved:', response.data.filename);
      
      if (onCapture) {
        onCapture({ eventId, ...response.data });
      }
      return response.data;
    } catch (err) {
      console.error('❌ Capture upload failed:', err);
      return null;
    }
  };

  return (
    <div className="live-monitor card">
      <div className="monitor-header">
        <span className="badge" style={{ background: streamStatus === 'live' ? 'var(--success)' : 'var(--warning)' }}>
          {streamStatus.toUpperCase()}
        </span>
        <h3>Live Cat Cam</h3>
        {streamStatus === 'live' && !isRecording && (
          <button 
            className="btn btn-sm" 
            onClick={async () => {
              const manualId = `manual-${Date.now()}`;
              try {
                // 1. Register the manual event on the backend
                const event = await createManualEvent(manualId);
                // 2. Start the 10s recording
                await performRecord(manualId);
              } catch (err) {
                console.error('Manual analysis failed:', err);
              }
            }}
            style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000' }}
          >
            📹 Analyze Video Now
          </button>
        )}
      </div>

      <div className="video-container" style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9' }}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        
        {streamStatus === 'connecting' && (
          <div className="overlay">Connecting to Febo...</div>
        )}

        {isRecording && (
          <div className="overlay recording">
            <div className="rec-indicator">● REC</div>
            <div className="countdown">{countdown}s</div>
          </div>
        )}
        
        {error && (
          <div className="overlay error">
            <p>⚠️ {error}</p>
            <button className="btn btn-sm" onClick={startStream}>Retry</button>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <style>{`
        .live-monitor {
          margin-bottom: 2rem;
          padding: 1.5rem;
          border-left: 4px solid var(--accent);
        }
        .monitor-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.7);
          color: #fff;
          font-size: 0.9rem;
          text-align: center;
          padding: 1rem;
        }
        .overlay.error {
          background: rgba(185, 28, 28, 0.8);
        }
      `}</style>
    </div>
  );
});

export default LiveMonitor;
