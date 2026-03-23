import React from 'react';
import Logo from './Logo';

// cn helper inline to avoid import issues
function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
      { id: 'scanner',   icon: '◎', label: 'Live Scanner' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'register',  icon: '⊕', label: 'Register' },
      { id: 'logs',      icon: '≡', label: 'Logs' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'analytics', icon: '◇', label: 'Analytics' },
      { id: 'settings',  icon: '⚙', label: 'Settings' },
    ],
  },
];

export default function Sidebar({ tab, setTab, health, onSearch }) {
  return (
    <aside
      className="sidebar"
      style={{
        width: 'var(--sidebar-w, 220px)',
        height: '100%',
        borderRight: '1px solid hsl(var(--border))',
        background: 'hsl(var(--background))',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 56, padding: '0 16px',
        borderBottom: '1px solid hsl(var(--border))',
        flexShrink: 0,
      }}>
        <Logo />
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' }}>
        <button
          onClick={onSearch}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', height: 32, padding: '0 10px',
            borderRadius: 6, fontSize: 12,
            color: 'hsl(var(--muted-foreground))',
            background: 'hsl(var(--muted))',
            border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14 }}>⌕</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
          <kbd style={{
            fontSize: 9, background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))', borderRadius: 4,
            padding: '1px 4px', fontFamily: 'monospace', opacity: 0.6,
          }}>⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_SECTIONS.map(section => (
          <div key={section.label} style={{ marginBottom: 4 }}>
            <p style={{
              padding: '6px 16px', fontSize: 10, fontWeight: 600,
              color: 'hsl(var(--muted-foreground) / 0.6)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              userSelect: 'none',
            }}>
              {section.label}
            </p>
            {section.items.map(item => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: 'calc(100% - 8px)', margin: '0 4px',
                    padding: '6px 12px', borderRadius: 6,
                    fontSize: 14, fontWeight: active ? 500 : 400,
                    color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    background: active ? 'hsl(var(--secondary))' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontSize: 16, width: 20, textAlign: 'center', lineHeight: 1,
                    flexShrink: 0, opacity: active ? 1 : 0.6,
                  }}>
                    {item.icon}
                  </span>
                  {item.label}
                  {active && (
                    <span style={{
                      marginLeft: 'auto', width: 6, height: 6,
                      borderRadius: '50%', background: 'hsl(var(--foreground) / 0.6)',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer — health */}
      <div style={{
        borderTop: '1px solid hsl(var(--border))',
        padding: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: health?.ok ? '#22c55e' : '#ef4444',
            boxShadow: `0 0 0 2px ${health?.ok ? '#22c55e33' : '#ef444433'}`,
            animation: health?.ok ? 'pulse 1.8s ease infinite' : 'none',
            display: 'inline-block',
          }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {health?.ok ? 'System Online' : 'Offline'}
            </p>
            <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {health?.ok ? `${health.users} registered · v2` : 'Check Railway'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
