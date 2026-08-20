import React, { useEffect, useState } from 'react';
import { Trash2, X, ExternalLink } from 'lucide-react';
import { findPaperByIdentifier } from '../utils/paperIdentity';

const VIEWED_KEY = 'hsc_viewed_papers';
const COMPLETED_KEY = 'hsc_completed_papers';

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

export default function PaperHistory({ allPapers = [], subjects = [], schools = [], onSelectPaper }) {
  const [viewed, setViewed] = useState([]);
  const [completed, setCompleted] = useState([]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('hsc:history-updated', handler);
    return () => window.removeEventListener('hsc:history-updated', handler);
  }, []);

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]');
      const c = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]');
      setViewed(Array.isArray(v) ? v : []);
      setCompleted(Array.isArray(c) ? c : []);
    } catch (e) {
      setViewed([]);
      setCompleted([]);
    }
  }

  function resolvePaperFromHistory(entryOrId) {
    if (entryOrId && typeof entryOrId === 'object') {
      const exact = allPapers.find((paper) =>
        String(paper.v) === String(entryOrId.key || entryOrId.v) &&
        String(paper.s) === String(entryOrId.s) &&
        String(paper.y) === String(entryOrId.y) &&
        String(paper.h) === String(entryOrId.h) &&
        String(paper.n) === String(entryOrId.n)
      );
      if (exact) return exact;
      if (entryOrId.key) return findPaperByIdentifier(allPapers, entryOrId.key);
      if (entryOrId.v) return findPaperByIdentifier(allPapers, entryOrId.v);
      return null;
    }

    return findPaperByIdentifier(allPapers, entryOrId);
  }

  function openPaperById(entryOrId) {
    const p = resolvePaperFromHistory(entryOrId);
    if (p && onSelectPaper) onSelectPaper(p);
  }

  function removeViewed(id) {
    try {
      const arr = JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]').filter(a => String(a.key || a.v) !== String(id));
      localStorage.setItem(VIEWED_KEY, JSON.stringify(arr));
      setViewed(arr);
      window.dispatchEvent(new CustomEvent('hsc:history-updated'));
    } catch (e) { /* ignore */ }
  }

  function removeCompleted(id) {
    try {
      const arr = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]').filter(a => String(a.id || a.paperId || a.paperIdLegacy || a.v) !== String(id));
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(arr));
      setCompleted(arr);
      window.dispatchEvent(new CustomEvent('hsc:history-updated'));
    } catch (e) { /* ignore */ }
  }

  function clearViewed() {
    localStorage.removeItem(VIEWED_KEY);
    setViewed([]);
    window.dispatchEvent(new CustomEvent('hsc:history-updated'));
  }

  function clearCompleted() {
    localStorage.removeItem(COMPLETED_KEY);
    setCompleted([]);
    window.dispatchEvent(new CustomEvent('hsc:history-updated'));
  }

  return (
    <div style={{ padding: '18px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Paper History</div>
          <h2 className="page-title">Recently viewed and completed papers</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={clearViewed} className="btn-secondary" title="Clear viewed list">Clear viewed</button>
          <button onClick={clearCompleted} className="btn-secondary" title="Clear completed list">Clear completed</button>
          <button onClick={() => { clearViewed(); clearCompleted(); }} className="btn-secondary" title="Clear all history">Clear all</button>
        </div>
      </div>

      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">Recently Viewed</div>
          <div style={{ color: 'var(--text-muted)' }}>{viewed.length} item{viewed.length === 1 ? '' : 's'}</div>
        </div>

        {viewed.length === 0 ? (
          <div style={{ marginTop: 12, color: 'var(--text-muted)' }}>No recently viewed papers.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {viewed.map((v) => {
              const paper = resolvePaperFromHistory(v);
              return (
                <li key={v.v} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bg-modifier-accent)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--header-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{paper ? paper.n : v.n}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{paper ? (subjects[paper.s] || '') : ''} • {v.y || ''} • {fmtDate(v.dateViewed)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" onClick={() => openPaperById(v)}>Open</button>
                    <button className="btn-secondary" onClick={() => removeViewed(v.key || v.v)} title="Remove from viewed">Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">Completed</div>
          <div style={{ color: 'var(--text-muted)' }}>{completed.length} item{completed.length === 1 ? '' : 's'}</div>
        </div>

        {completed.length === 0 ? (
          <div style={{ marginTop: 12, color: 'var(--text-muted)' }}>No completed papers yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {completed.map((c) => {
              const paper = resolvePaperFromHistory(c);
              return (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bg-modifier-accent)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--header-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{paper ? paper.n : c.paperName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.subjectName || (paper ? subjects[paper.s] : '')} • {c.timeSpent ? `${Math.round(c.timeSpent/60)} min` : ''} • {fmtDate(c.dateCompleted)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" onClick={() => openPaperById(c)}>Open</button>
                    <button className="btn-secondary" onClick={() => removeCompleted(c.id || c.paperId || c.paperIdLegacy || c.v)} title="Remove from completed">Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
