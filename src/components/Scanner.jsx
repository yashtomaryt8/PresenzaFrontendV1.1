import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, cn } from './ui';
import { api } from '../utils/api';

const SCAN_MS    = 800;   // V2: slightly faster
const COOLDOWN_S = 12;    // must match backend SCAN_COOLDOWN_S

function computeMotion(prev, curr) {
  if (!prev || !curr || prev.length !== curr.length) return 1;
  let diff = 0;
  const n = Math.min(prev.length, 2400);
  for (let i = 0; i < n; i++) diff += Math.abs(prev[i] - curr[i]);
  return diff / n / 255;
}

export default function Scanner() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const prevPx    = useRef(null);
  const fpsRef    = useRef({ n: 0, t: Date.now() });
  const scanTimer = useRef(null);
  const sseRef    = useRef(null);

  const [mode,        setMode]       = useState('entry');
  const [paused,      setPaused]     = useState(false);
  const [facing,      setFacing]     = useState('user');
  const [detections,  setDetections] = useState([]);
  // REMOVED: const [log, setLog] = useState([]);
  const [sseLog,      setSseLog]     = useState([]);      // real-time from SSE
  const [fps,         setFps]        = useState(0);
  const [active,      setActive]     = useState(false);
  const [motion,      setMotion]     = useState(1);
  const [cooldowns,   setCooldowns]  = useState({});       // {name: secondsLeft}

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    const url = api.logsSSEUrl();
    const es  = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'attendance') {
          setSseLog(prev => [data, ...prev].slice(0, 60));
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE auto-reconnects; no action needed
    };

    return () => es.close();
  }, []);

  // ── Cooldown ticker ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setCooldowns(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          next[k] -= 1;
          if (next[k] <= 0) delete next[k];
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Draw bounding boxes ─────────────────────────────────────────────────────
  const drawBoxes = useCallback((dets, cW, cH) => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = cW; c.height = cH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);
    const scale = Math.min(cW / 320, cH / 240);
    const offX  = (cW - 320 * scale) / 2;
    const offY  = (cH - 240 * scale) / 2;

    dets.forEach(d => {
      if (!d.bbox) return;
      const [x1, y1, x2, y2] = d.bbox;
      const rx1 = offX + x1 * scale;
      const ry1 = offY + y1 * scale;
      const rw  = (x2 - x1) * scale;
      const rh  = (y2 - y1) * scale;

      const isBlurry  = d.reason === 'blurry';
      const isCooldown = d.reason?.startsWith('cooldown');
      const isKnown   = d.name !== 'Unknown' && !isBlurry;
      const color = isBlurry ? '#94a3b8' : isCooldown ? '#a855f7' : isKnown ? '#22c55e' : '#ef4444';

      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.strokeRect(rx1, ry1, rw, rh);
      ctx.font = 'bold 10px Inter, sans-serif';

      let label = isBlurry ? '◌ Blurry' : `${d.name}  ${d.confidence}%`;
      if (isCooldown) {
        const sec = d.reason.split(':')[1] || '';
        label = `✓ ${d.name} · wait ${sec}`;
      }
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color + 'dd';
      ctx.fillRect(rx1, ry1 - 18, tw + 8, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, rx1 + 4, ry1 - 5);

      if (d.event_type && !isBlurry && !isCooldown) {
        const tag = d.event_type.toUpperCase() + (d.logged ? ' ✓' : '');
        const tw2 = ctx.measureText(tag).width;
        ctx.fillStyle = color + 'cc';
        ctx.fillRect(rx1, ry1 + rh, tw2 + 8, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(tag, rx1 + 4, ry1 + rh + 13);
      }
    });
  }, []);

  // ── Scan loop ───────────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    if (paused || !webcamRef.current) return;
    const src = webcamRef.current.getScreenshot({ width: 320, height: 240 });
    if (!src) return;

    // Motion
    try {
      const tmp  = document.createElement('canvas');
      tmp.width = 64; tmp.height = 48;
      const tctx = tmp.getContext('2d');
      const img  = new Image(); img.src = src;
      await new Promise(r => { img.onload = r; });
      tctx.drawImage(img, 0, 0, 64, 48);
      const px = tctx.getImageData(0, 0, 64, 48).data;
      const m  = computeMotion(prevPx.current, px);
      prevPx.current = px;
      setMotion(m);
    } catch {}

    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'f.jpg');
      form.append('event_type', mode);
      const res  = await api.scan(form);
      const dets = res.detections || [];

      setDetections(dets);
      setActive(true);

      // Update cooldowns from backend reasons
      const newCooldowns = {};
      dets.forEach(d => {
        if (d.reason?.startsWith('cooldown:') && d.name !== 'Unknown') {
          const sec = parseFloat(d.reason.split(':')[1]) || COOLDOWN_S;
          newCooldowns[d.name] = Math.ceil(sec);
        }
      });
      if (Object.keys(newCooldowns).length > 0) {
        setCooldowns(prev => ({ ...prev, ...newCooldowns }));
      }

      const cont = canvasRef.current?.parentElement;
      if (cont) drawBoxes(dets, cont.clientWidth, cont.clientHeight);

      // REMOVED: The logic updating local 'log' state.
      // Since we use 'sseLog' for the UI, this local state was redundant.

      fpsRef.current.n++;
      const now = Date.now();
      if (now - fpsRef.current.t >= 3000) {
        setFps(Math.round(fpsRef.current.n / ((now - fpsRef.current.t) / 1000)));
        fpsRef.current = { n: 0, t: now };
      }
    } catch {}
  }, [paused, mode, drawBoxes]);

  useEffect(() => {
    scanTimer.current = setInterval(scan, SCAN_MS);
    return () => clearInterval(scanTimer.current);
  }, [scan]);

  const motionOk  = motion > 0.008;
  const motionLow = motion > 0.003 && !motionOk;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {fps > 0 ? `${fps} fps · ` : ''}
          GhostFace + Cosine · {COOLDOWN_S}s cooldown
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Mode</span>
        <Toggle
          value={mode}
          onChange={setMode}
          options={[{ value: 'entry', label: '→ Entry' }, { value: 'exit', label: '← Exit' }]}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn(
            'dot',
            motionOk ? 'dot-green' : motionLow ? 'dot-yellow' : 'dot-red',
            active && !paused && motionOk ? 'dot-pulse' : '',
          )} />
          <span>{motionOk ? 'Live' : motionLow ? 'Low motion' : 'Static'}</span>
        </div>
      </div>

      {/* Camera */}
      <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 320, height: 240, facingMode: facing }}
          mirrored={facing === 'user'}
          className="cam-contain"
        />
        <canvas ref={canvasRef} className="bbox-layer" />
        {active && !paused && motionOk && <div className="scan-line" />}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
          <div
            className={cn('h-full transition-all', motionOk ? 'bg-green-500' : motionLow ? 'bg-yellow-500' : 'bg-red-500')}
            style={{ width: `${Math.min(100, motion * 8000)}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={paused ? 'default' : 'outline'} size="sm" onClick={() => setPaused(p => !p)}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>
          ⟳ Flip
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setDetections([]); setSseLog([]); }}>
          Clear
        </Button>
      </div>

      {/* Active cooldowns */}
      {Object.keys(cooldowns).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(cooldowns).map(([name, sec]) => (
            <div key={name} className="flex items-center gap-1.5 px-2.5 py-1 border border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-full text-xs font-medium">
              <span>⏱</span>{name} · {sec}s
            </div>
          ))}
        </div>
      )}

      {/* Live detections */}
      {detections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detections.map((d, i) => {
            const isKnown  = d.name !== 'Unknown' && d.reason !== 'blurry';
            const isCool   = d.reason?.startsWith('cooldown');
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                isCool   ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                isKnown  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300' :
                           'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              )}>
                {d.thumbnail_b64 ? (
                  <img
                    src={`data:image/jpeg;base64,${d.thumbnail_b64}`}
                    alt=""
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <span>{isCool ? '⏱' : isKnown ? '✓' : '?'}</span>
                )}
                {d.name} · {d.confidence}%
              </div>
            );
          })}
        </div>
      )}

      {/* Real-time SSE log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Live Attendance Feed</h2>
          <Badge variant={mode === 'entry' ? 'green' : 'yellow'}>{mode === 'entry' ? '→ Entry' : '← Exit'}</Badge>
        </div>
        {sseLog.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Waiting for detections…</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Real-time via SSE · No polling</p>
          </div>
        ) : (
          <Card>
            {sseLog.slice(0, 15).map((d, i) => (
              <div key={i} className={cn(
                'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors',
                i < sseLog.length - 1 ? 'border-b border-border' : '',
              )}>
                {/* Thumbnail */}
                {d.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${d.thumbnail}`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-border"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700 flex-shrink-0">
                    {d.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">{[d.student_id, d.department].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant={d.event_type === 'entry' ? 'green' : 'yellow'}>{d.event_type}</Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}