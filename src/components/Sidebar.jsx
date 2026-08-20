import React, { useState } from 'react';
import { BookOpen, GraduationCap, Calendar, Database, Library, Bookmark, X, Smartphone, Share2, PlusSquare, ChevronLeft, ChevronRight } from 'lucide-react';

function SidebarButton({ active, icon: Icon, label, onClick, color = 'var(--text-normal)' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sidebar-button ${active ? 'is-active' : ''}`}
      style={{ color }}
      title={label}
      aria-label={label}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

export default function Sidebar({
  subjects,
  mySubjects = [],
  selectedSubject,
  setSelectedSubject,
  selectedLevel,
  setSelectedLevel,
  viewBookmarks,
  setViewBookmarks,
  viewTextbooks,
  setViewTextbooks,
  viewCalendar,
  setViewCalendar,
  viewNotebook = false,
  setViewNotebook,
  bookmarksCount,
  totalPapersCount,
  subjectCounts,
  isCollapsed,
  onToggleCollapse,
  onCloseMobile
}) {
  const [showInstallModal, setShowInstallModal] = useState(false);
  const visibleSubjectIndexes = mySubjects.length > 0
    ? mySubjects
        .map((name) => subjects.findIndex((subject) => subject === name))
        .filter((idx) => idx !== -1)
    : subjects.map((_, idx) => idx);

  const visibleSubjectTotal = visibleSubjectIndexes.reduce((sum, idx) => {
    return sum + (subjectCounts[idx] || 0);
  }, 0);

  return (
    <aside className="study-sidebar">
      <div className="study-sidebar-header">
        <div className="study-sidebar-brand">
          <div className="study-brand-mark">
            <GraduationCap size={20} />
          </div>
          <div className="study-sidebar-brand-copy">
            <div className="study-sidebar-kicker">HSC Portal</div>
            <div className="study-sidebar-title">Study map</div>
          </div>
        </div>
        <div className="study-sidebar-header-actions">
          <button
            type="button"
            className="btn-secondary sidebar-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {onCloseMobile && (
            <button
              type="button"
              className="btn-secondary mobile-sidebar-close"
              onClick={onCloseMobile}
              style={{ padding: '6px' }}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-section sidebar-section--views">
        <div className="sidebar-section-label">View</div>
        <div className="sidebar-button-stack">
          <SidebarButton
            active={!viewBookmarks && !viewTextbooks && !viewCalendar && !viewNotebook}
            icon={Library}
            label="Past papers"
            onClick={() => {
              setViewBookmarks(false);
              setViewTextbooks(false);
              setViewCalendar(false);
              setViewNotebook?.(false);
              setSelectedLevel(12);
            }}
          />
          <SidebarButton
            active={viewBookmarks}
            icon={Bookmark}
            label={`Saved papers ${bookmarksCount > 0 ? `(${bookmarksCount})` : ''}`.trim()}
            onClick={() => {
              setViewBookmarks(true);
              setViewTextbooks(false);
              setViewCalendar(false);
              setViewNotebook?.(false);
            }}
            color="var(--status-positive)"
          />
          <SidebarButton
            active={viewTextbooks}
            icon={BookOpen}
            label="Textbooks"
            onClick={() => {
              setViewTextbooks(true);
              setViewBookmarks(false);
              setViewCalendar(false);
              setViewNotebook?.(false);
            }}
          />
          <SidebarButton
            active={viewCalendar}
            icon={Calendar}
            label="Calendar"
            onClick={() => {
              setViewCalendar(true);
              setViewBookmarks(false);
              setViewTextbooks(false);
              setViewNotebook?.(false);
            }}
            color="var(--status-warning)"
          />
        </div>
      </div>

      <div className="sidebar-section sidebar-section--year">
        <div className="sidebar-section-label">Year level</div>
        <div className="sidebar-chip-row">
          <button
            type="button"
            className={`sidebar-chip-button ${selectedLevel === 12 && !viewBookmarks && !viewCalendar ? 'is-active' : ''}`}
            onClick={() => {
              setSelectedLevel(12);
              setViewBookmarks(false);
              setViewTextbooks(false);
              setViewCalendar(false);
              setViewNotebook?.(false);
            }}
          >
            Year 12
          </button>
          <button
            type="button"
            className={`sidebar-chip-button ${selectedLevel === 11 && !viewBookmarks && !viewCalendar ? 'is-active' : ''}`}
            onClick={() => {
              setSelectedLevel(11);
              setViewBookmarks(false);
              setViewTextbooks(false);
              setViewCalendar(false);
              setViewNotebook?.(false);
            }}
          >
            Year 11
          </button>
        </div>
      </div>

      <div className="sidebar-section sidebar-section--subjects sidebar-scroll-section">
        <div className="sidebar-section-label">Subjects</div>
        <button
          type="button"
          className={`sidebar-subject ${selectedSubject === null || viewTextbooks ? 'is-active' : ''}`}
          onClick={() => {
            if (viewTextbooks) return;
            setSelectedSubject(null);
            setViewBookmarks(false);
            setViewNotebook?.(false);
          }}
        >
          <span className="sidebar-subject-name">All papers</span>
          <span className="sidebar-subject-count">{visibleSubjectTotal.toLocaleString()}</span>
        </button>

        {!viewTextbooks && visibleSubjectIndexes.map((idx) => {
          const sub = subjects[idx];
          const count = subjectCounts[idx] || 0;
          if (!sub || count === 0) return null;
          const isSelected = selectedSubject === idx;

          return (
            <button
              type="button"
              key={idx}
              className={`sidebar-subject ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedSubject(idx);
                setViewBookmarks(false);
                setViewTextbooks(false);
                setViewNotebook?.(false);
              }}
            >
              <span className="sidebar-subject-name">{sub}</span>
              <span className="sidebar-subject-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="study-sidebar-footer">
        <button
          type="button"
          onClick={() => setShowInstallModal(true)}
          className="btn-secondary"
          style={{ width: '100%', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', padding: '8px 12px' }}
        >
          <Smartphone size={16} />
          <span>Install App (iPhone & Android)</span>
        </button>

        <div className="study-sidebar-stat">
          <Database size={16} />
          <div>
            <div className="study-sidebar-stat-label">Local library</div>
            <div className="study-sidebar-stat-value">{totalPapersCount.toLocaleString()} resources</div>
          </div>
        </div>
      </div>

      {showInstallModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--sidebar-border)',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            color: 'var(--text-normal)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={20} style={{ color: 'var(--brand-experiment)' }} />
                Install HSC Prep App
              </h3>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="btn-secondary"
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              Enjoy full-screen offline access without browser tabs by installing HSC Prep directly to your phone's home screen.
            </p>

            <div style={{ display: 'grid', gap: '16px', fontSize: '13px' }}>
              <div style={{ background: 'var(--bg-canvas)', padding: '14px', borderRadius: '12px', border: '1px solid var(--sidebar-border)' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Share2 size={16} style={{ color: 'var(--status-positive)' }} />
                  iPhone & iPad (Safari)
                </div>
                <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  <li>Open this website in <strong>Safari</strong> on iOS.</li>
                  <li>Tap the <strong>Share</strong> button <span style={{ fontFamily: 'monospace' }}>[↑]</span> at the bottom of the screen.</li>
                  <li>Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top right corner. The app icon will appear on your home screen!</li>
                </ol>
              </div>

              <div style={{ background: 'var(--bg-canvas)', padding: '14px', borderRadius: '12px', border: '1px solid var(--sidebar-border)' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PlusSquare size={16} style={{ color: 'var(--brand-experiment)' }} />
                  Android (Chrome / Edge)
                </div>
                <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  <li>Open this website in <strong>Chrome</strong>.</li>
                  <li>Tap the menu icon (three dots <span style={{ fontFamily: 'monospace' }}>⋮</span>) in the top right.</li>
                  <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>Confirm the prompt to pin the app to your home screen.</li>
                </ol>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="btn-primary"
                style={{ width: '100%', padding: '10px' }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
