import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DynamicIslandNav from './components/DynamicIslandNav';
import GlobalSearch from './components/GlobalSearch';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Register from './components/Register';
import Logs from './components/Logs';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import { api } from './utils/api';

export default function App() {
  const [tab,         setTab]         = useState('dashboard');
  const [health,      setHealth]      = useState(null);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ping = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth({ ok: true, users: h.users, hf: h.hf_space, version: h.version });
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  useEffect(() => {
    ping();
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [ping]);

  // ⌘K shortcut
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleTabChange = (t) => {
    setTab(t);
    setSidebarOpen(false);
  };

  const pages = {
    dashboard: <Dashboard setTab={setTab} />,
    scanner:   <Scanner />,
    register:  <Register />,
    logs:      <Logs />,
    analytics: <Analytics />,
    settings:  <Settings health={health} />,
  };

  return (
    <div className="app-shell">
      {/* Desktop sidebar — always visible lg+ */}
      <div className="hidden lg:flex" style={{ height: '100%' }}>
        <Sidebar
          tab={tab}
          setTab={handleTabChange}
          health={health}
          onSearch={() => setSearchOpen(true)}
        />
      </div>

      {/* Mobile sidebar overlay — only when open */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 39,
              animation: 'fadeIn 0.15s ease',
            }}
          />
          {/* Sidebar panel */}
          <div
            className="lg:hidden"
            style={{
              position: 'fixed', top: 0, left: 0,
              height: '100dvh', zIndex: 40,
              boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
              animation: 'slideInLeft 0.2s ease',
            }}
          >
            <Sidebar
              tab={tab}
              setTab={handleTabChange}
              health={health}
              onSearch={() => { setSidebarOpen(false); setSearchOpen(true); }}
            />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="main-area">
        <Header
          tab={tab}
          health={health}
          onSearch={() => setSearchOpen(true)}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        <div className="page-scroll">
          <div className="page-content">
            {pages[tab] || pages.dashboard}
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <DynamicIslandNav tab={tab} setTab={handleTabChange} />

      {/* Global search */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
