import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Card, Input, Select, Badge, Spinner, Alert, Empty, Toggle, cn } from './ui';
import { api } from '../utils/api';

function today() { return new Date().toISOString().slice(0, 10); }
function arr(d) { return Array.isArray(d) ? d : (d?.results || []); }

function SnapshotModal({ log, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.logSnapshot(log.id).then(setData).catch(() => setData(null));
  }, [log.id]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'hsl(var(--background))', borderRadius: 12, padding: 20,
          border: '1px solid hsl(var(--border))', maxWidth: 380, width: '100%',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontWeight: 600 }}>{log.user_name}</p>
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
              {log.event_type} · {new Date(log.timestamp).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'hsl(var(--muted-foreground))' }}>✕</button>
        </div>
        {!data ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spinner size={20} /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {data.face_thumbnail_b64 ? (
              <div>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Face</p>
                <img src={`data:image/jpeg;base64,${data.face_thumbnail_b64}`} alt="face" style={{ width: '100%', borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
              </div>
            ) : (
              <div style={{ background: 'hsl(var(--muted))', borderRadius: 8, padding: 12, textAlign: 'center', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>No face crop</div>
            )}
            {data.snapshot_b64 ? (
              <div>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Snapshot</p>
                <img src={`data:image/jpeg;base64,${data.snapshot_b64}`} alt="snapshot" style={{ width: '100%', borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
              </div>
            ) : (
              <div style={{ background: 'hsl(var(--muted))', borderRadius: 8, padding: 12, textAlign: 'center', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>No snapshot</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserWithThumb({ user }) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    if (user.has_thumbnail) {
      api.userThumbnail(user.id).then(d => setThumb(d.thumbnail_b64)).catch(() => {});
    }
  }, [user.id, user.has_thumbnail]);

  return (
    <div className="flex items-center gap-2 w-8 h-8 flex-shrink-0">
      {thumb ? (
        <img src={`data:image/jpeg;base64,${thumb}`} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
          {user.name?.[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

export default function Logs() {
  const [tab,        setTab]     = useState('logs');
  const [logs,       setLogs]    = useState([]);
  const [users,      setUsers]   = useState([]);
  const [loading,    setLoading] = useState(true);
  const [err,        setErr]     = useState('');
  const [filters,    setFilters] = useState({ name: '', event: '', date: today() });
  const [liveCount,  setLive]    = useState(0);   // SSE events received
  const [snapshot,   setSnap]    = useState(null); // log row to show snapshot for
  const sseRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filters.name)  params.name  = filters.name;
      if (filters.event) params.event = filters.event;
      if (filters.date)  params.date  = filters.date;
      const [l, u] = await Promise.all([api.logs(params), api.users()]);
      setLogs(arr(l)); setUsers(arr(u)); setErr('');
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // SSE: auto-reload logs when new attendance comes in
  useEffect(() => {
    const url = api.logsSSEUrl();
    const es  = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'attendance') {
          setLive(n => n + 1);
          // Prepend new event to log list (no re-fetch needed)
          setLogs(prev => [{
            id:             Date.now(),
            user_name:      data.name,
            user_student_id: data.student_id,
            department:     data.department,
            event_type:     data.event_type,
            timestamp:      data.timestamp,
            confidence:     data.confidence / 100,
            has_thumbnail:  Boolean(data.thumbnail),
            has_snapshot:   false,
            _live:          true,
          }, ...prev].slice(0, 200));
        }
      } catch {}
    };

    return () => es.close();
  }, []);

  const deleteUser = async (id, name) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    try { await api.deleteUser(id); load(); } catch (e) { setErr(e.message); }
  };

  const exportCSV = async () => {
    try {
      const res  = await api.exportCSV(filters.date || today());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `presenza_${filters.date}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  };

  const sf = (k, v) => setFilters(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      {snapshot && <SnapshotModal log={snapshot} onClose={() => setSnap(null)} />}

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Logs & Students</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time via SSE · {liveCount > 0 && <span className="text-green-500 font-medium">{liveCount} live event{liveCount !== 1 ? 's' : ''}</span>}
        </p>
      </div>

      <Toggle
        value={tab}
        onChange={setTab}
        options={[
          { value: 'logs',  label: `Logs (${logs.length})` },
          { value: 'users', label: `Students (${users.length})` },
        ]}
      />

      {err && <Alert variant="error">⚠ {err}</Alert>}

      {tab === 'logs' && (
        <Card>
          <div className="p-4 space-y-3 border-b border-border">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Search name…" value={filters.name} onChange={e => sf('name', e.target.value)} />
              <Select value={filters.event} onChange={e => sf('event', e.target.value)}>
                <option value="">All events</option>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <input
                type="date" value={filters.date}
                onChange={e => sf('date', e.target.value)}
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button variant="outline" size="sm" onClick={exportCSV}>↓ CSV</Button>
              <Button variant="ghost" size="sm" onClick={load}>↺</Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner size={20} className="text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <Empty icon="≡" title="No records" sub="Try changing the filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[440px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {['', 'Name', 'ID', 'Dept', 'Event', 'Time', 'Conf', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className={cn('border-b border-border last:border-0 hover:bg-muted/30 transition-colors', l._live ? 'bg-green-50/30 dark:bg-green-950/20' : '')}>
                      <td className="px-2 py-2">
                        {l._live && <span className="dot dot-green dot-pulse" style={{ width: 6, height: 6 }} />}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{l.user_name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{l.user_student_id || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{l.department || '—'}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={l.event_type === 'entry' ? 'green' : 'yellow'}>{l.event_type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                        {new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                        {l.confidence ? `${(l.confidence * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {(l.has_thumbnail || l.has_snapshot) && (
                          <button
                            onClick={() => setSnap(l)}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          >
                            📷
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'users' && (
        <Card>
          {users.length === 0 ? (
            <Empty icon="+" title="No students registered" />
          ) : (
            users.map((u, i) => (
              <div key={u.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors', i < users.length - 1 ? 'border-b border-border' : '')}>
                <UserWithThumb user={u} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[u.student_id, u.department].filter(Boolean).join(' · ')}
                    {u.covered_angles?.length > 0 && ` · ${u.covered_angles.join('/')} angles`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={u.photo_count >= 3 ? 'green' : 'yellow'}>{u.photo_count}p</Badge>
                  <Badge variant={u.is_present ? 'green' : 'secondary'}>{u.is_present ? 'In' : 'Out'}</Badge>
                  {u.fed_update_count > 0 && (
                    <span className="text-[10px] text-purple-500 font-medium">+{u.fed_update_count}fed</span>
                  )}
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => deleteUser(u.id, u.name)}
                    className="w-7 h-7 text-muted-foreground hover:text-destructive"
                  >✕</Button>
                </div>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  );
}
