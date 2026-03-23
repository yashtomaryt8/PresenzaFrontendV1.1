import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Card, CardHeader, CardTitle, CardBody, Input, Badge, Alert, Spinner } from './ui';
import { api } from '../utils/api';

const MAX  = 10;
const ANGLE_TARGETS = ['front', 'left', 'right'];
const BLUR_MIN      = 80;   // matches backend

function AngleProgress({ covered }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {ANGLE_TARGETS.map(a => (
        <div key={a} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
          covered.includes(a)
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
            : 'border-border text-muted-foreground'
        }`}>
          {covered.includes(a) ? '✓' : '○'} {a}
        </div>
      ))}
    </div>
  );
}

function DuplicateModal({ info, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 12, padding: 24, maxWidth: 360, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
          Face Already Registered
        </h2>
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', marginBottom: 16 }}>
          This face matches <strong>{info.matched_name || 'an existing user'}</strong>
          {info.similarity && ` (${Math.round(info.similarity * 100)}% similarity)`}.
          Registering again may cause duplicate attendance records.
        </p>
        {info.thumbnail_b64 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img
              src={`data:image/jpeg;base64,${info.thumbnail_b64}`}
              alt="matched face"
              style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid hsl(var(--border))' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>Register Anyway</Button>
        </div>
      </div>
    </div>
  );
}

function QualityBadge({ result }) {
  if (!result) return null;
  if (result.status === 'accepted') {
    return (
      <span className="text-[10px] text-green-600 font-medium">
        ✓ {result.pose_tag} · blur:{result.blur_score?.toFixed(0)}
      </span>
    );
  }
  if (result.status === 'rejected') {
    return (
      <span className="text-[10px] text-yellow-600 font-medium">
        ⚠ Blurry (score:{result.blur_score?.toFixed(0)})
      </span>
    );
  }
  return <span className="text-[10px] text-red-500 font-medium">✕ Failed</span>;
}

export default function Register() {
  const wRef  = useRef(null);
  const fRef  = useRef(null);

  const [name,    setName]    = useState('');
  const [sid,     setSid]     = useState('');
  const [dept,    setDept]    = useState('');
  const [photos,  setPhotos]  = useState([]);     // [{blob, url, qualResult}]
  const [load,    setLoad]    = useState(false);
  const [msg,     setMsg]     = useState(null);
  const [facing,  setFacing]  = useState('user');
  const [showCam, setShowCam] = useState(true);
  const [covered, setCovered] = useState([]);     // angle tags covered
  const [dupInfo, setDupInfo] = useState(null);   // for duplicate modal
  // Removed: const [skipDup, setSkipDup] = useState(false); // Unused state removed

  const removePhoto = (i) => {
    setPhotos(prev => prev.filter((_, j) => j !== i));
  };

  // ── Capture from webcam ────────────────────────────────────────────────────
  const capture = useCallback(() => {
    if (photos.length >= MAX) return;
    const src = wRef.current?.getScreenshot({ width: 640, height: 480 });
    if (!src) return;
    fetch(src).then(r => r.blob()).then(b => {
      setPhotos(p => [...p, { blob: b, url: src, qualResult: null }]);
    });
  }, [photos.length]);

  const onFiles = e => {
    const fs = Array.from(e.target.files || []).slice(0, MAX - photos.length);
    setPhotos(p => [
      ...p,
      ...fs.map(f => ({ blob: f, url: URL.createObjectURL(f), qualResult: null })),
    ].slice(0, MAX));
    e.target.value = '';
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const doSubmit = async (forceDup = false) => {
    if (!name.trim()) return setMsg({ ok: false, text: 'Name is required.' });
    if (!photos.length) return setMsg({ ok: false, text: 'Add at least 1 photo.' });

    setLoad(true); setMsg(null);
    const form = new FormData();
    form.append('name', name.trim());
    form.append('student_id', sid.trim());
    form.append('department', dept.trim());
    if (forceDup) form.append('skip_duplicate_check', 'true');
    
    photos.forEach((p, i) => form.append(`image_${i}`, p.blob, `p${i}.jpg`));

    try {
      const r = await api.register(form);
      setMsg({ ok: true, text: r.message + (r.angle_warning ? ` ${r.angle_warning}` : '') });
      setCovered(r.covered_angles || []);

      // Update photo quality results in-place
      if (r.qual_results) {
        setPhotos(prev => prev.map((p, i) => ({
          ...p,
          qualResult: r.qual_results[i] || null,
        })));
      }

      if (!r.blurry_rejected && !r.failed) {
        // Clean success
        setTimeout(() => { setName(''); setSid(''); setDept(''); setPhotos([]); setCovered([]); }, 2000);
      }
    } catch (e) {
      if (e.status === 409) {
        // Duplicate detected
        let info = {};
        try { info = JSON.parse(e.message) || {}; } catch {}
        setDupInfo({
          matched_name:  info.matched_name || 'existing user',
          similarity:    info.similarity || 0,
          thumbnail_b64: info.thumbnail_b64 || '',
        });
      } else {
        setMsg({ ok: false, text: e.message });
      }
    } finally {
      setLoad(false);
    }
  };

  const handleDupConfirm = async () => {
    setDupInfo(null); // Close modal immediately
    // Removed: setSkipDup(true); // Unused state
    await doSubmit(true); // Pass force flag explicitly
    // Removed: setSkipDup(false); // Unused state
  };

  const anglesMet = ANGLE_TARGETS.every(a => covered.includes(a));

  return (
    <div className="space-y-5">
      {dupInfo && (
        <DuplicateModal
          info={dupInfo}
          onConfirm={handleDupConfirm}
          onCancel={() => setDupInfo(null)}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Register Student</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Capture 3+ angles · Blur rejection · Duplicate check
        </p>
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle>Student Details</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Input label="Full Name *" placeholder="e.g. Yash Tomar" value={name} onChange={e => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Student ID" placeholder="CS2201" value={sid} onChange={e => setSid(e.target.value)} />
            <Input label="Department" placeholder="CSE" value={dept} onChange={e => setDept(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      {/* Camera */}
      <Card>
        <CardHeader>
          <CardTitle>Face Photos ({photos.length}/{MAX})</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCam(v => !v)}>{showCam ? 'Hide' : 'Camera'}</Button>
            <Button variant="ghost" size="sm" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>⟳</Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {/* Angle progress */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">
              Angle coverage {covered.length}/{ANGLE_TARGETS.length}
              {anglesMet && ' · ✓ All angles covered'}
            </p>
            <AngleProgress covered={covered} />
          </div>

          {showCam && (
            <>
              <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
                <Webcam
                  ref={wRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ width: 640, height: 480, facingMode: facing }}
                  mirrored={facing === 'user'}
                  className="cam-contain"
                />
              </div>
              <Button className="w-full" size="sm" onClick={capture} disabled={photos.length >= MAX}>
                📸 Capture Photo
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Tip: Capture front · turn left · turn right for best accuracy
              </p>
            </>
          )}

          <input ref={fRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
          <Button variant="outline" size="sm" className="w-full" onClick={() => fRef.current?.click()}>
            ↑ Upload from Gallery
          </Button>

          {/* Blur quality note */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
            <span>ℹ</span>
            Blurry images are automatically rejected (Laplacian score &lt; {BLUR_MIN})
          </div>
        </CardBody>
      </Card>

      {/* Photo grid */}
      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Captured Photos</CardTitle>
            <Badge variant={photos.length >= 3 ? 'green' : 'yellow'}>
              {photos.length >= 3 ? '✓ Good' : `${3 - photos.length} more recommended`}
            </Badge>
          </CardHeader>
          <CardBody>
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={i} className="photo-thumb">
                  <img src={p.url} alt="" />
                  <button className="remove" onClick={() => removePhoto(i)}>✕</button>
                  {p.qualResult && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.6)', padding: '2px 4px',
                    }}>
                      <QualityBadge result={p.qualResult} />
                    </div>
                  )}
                </div>
              ))}
              {photos.length < MAX && (
                <button className="photo-add" onClick={() => fRef.current?.click()}>+</button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {msg && (
        <Alert variant={msg.ok ? 'success' : 'error'}>
          {msg.ok ? '✓ ' : '⚠ '}{msg.text}
        </Alert>
      )}

      <Button
        className="w-full"
        disabled={load || !name.trim() || !photos.length}
        onClick={() => doSubmit(false)}
      >
        {load
          ? <><Spinner size={14} /> Registering…</>
          : `Register · ${photos.length} photo${photos.length !== 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}