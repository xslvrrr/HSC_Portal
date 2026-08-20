import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ExternalLink, Settings2, Check, Download } from 'lucide-react';
import { getNextExamState, formatExamDate, normalizeConfig } from '../utils/examDates';
import { filterExamsForPortalSubject, filterExamsForPortalSubjects, getSchedulableSubjects } from '../utils/examSubjectMatch';
import { loadMySubjects, saveMySubjects } from '../utils/mySubjects';
import { exportExamsToIcs } from '../utils/exportIcs';

function CountdownUnit({ value, label, urgent }) {
  return (
    <div
      style={{
        minWidth: '56px',
        textAlign: 'center',
        padding: '8px 6px',
        borderRadius: '14px',
        background: urgent ? 'rgba(183,122,42,0.12)' : 'rgba(53,91,79,0.08)',
        color: urgent ? 'var(--status-warning)' : 'var(--brand-experiment)',
        border: `1px solid ${urgent ? 'rgba(183,122,42,0.18)' : 'rgba(53,91,79,0.14)'}`,
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9, marginTop: '4px' }}>
        {label}
      </div>
    </div>
  );
}

export default function ExamCountdown({ subjectName = null, portalSubjects = [] }) {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [mySubjects, setMySubjects] = useState(() => loadMySubjects());
  const [editingSubjects, setEditingSubjects] = useState(() => loadMySubjects().length === 0);
  const [draftSubjects, setDraftSubjects] = useState(() => loadMySubjects());

  const isHome = subjectName == null;

  useEffect(() => {
    const restoreSubjects = () => {
      const restoredSubjects = loadMySubjects();
      setMySubjects(restoredSubjects);
      setDraftSubjects(restoredSubjects);
      setEditingSubjects(restoredSubjects.length === 0);
    };
    const handleStorage = (event) => {
      if (event.key === 'hsc_my_subjects') restoreSubjects();
    };

    window.addEventListener('hsc:my-subjects-updated', restoreSubjects);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('hsc:my-subjects-updated', restoreSubjects);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    fetch('/hsc-exam-dates.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load exam dates.');
        return res.json();
      })
      .then((data) => {
        setConfig(data);
        setLoadError(null);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(err.message);
      });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const schedulableSubjects = useMemo(() => {
    if (!config) return [];
    const normalized = normalizeConfig(config);
    return getSchedulableSubjects(portalSubjects, normalized.exams);
  }, [config, portalSubjects]);

  const exportableExams = useMemo(() => {
    if (!config) return [];
    const { exams } = normalizeConfig(config);
    if (subjectName) return filterExamsForPortalSubject(exams, subjectName);
    if (isHome && mySubjects.length > 0) return filterExamsForPortalSubjects(exams, mySubjects);
    return exams;
  }, [config, subjectName, isHome, mySubjects]);

  const handleExportIcs = () => {
    if (!config || exportableExams.length === 0) return;
    const year = config.year ?? 2026;
    let calendarName = `HSC ${year} Written Exams`;
    let filename = `hsc-exams-${year}.ics`;

    if (subjectName) {
      calendarName = `HSC ${year} - ${subjectName}`;
      filename = `hsc-${subjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}.ics`;
    } else if (isHome && mySubjects.length > 0) {
      calendarName = `HSC ${year} - My subjects`;
      filename = `hsc-my-exams-${year}.ics`;
    }

    exportExamsToIcs(exportableExams, { calendarName, filename, year });
  };

  const exportLinks = (compact = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={handleExportIcs}
        disabled={exportableExams.length === 0}
        className="btn-secondary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          opacity: exportableExams.length === 0 ? 0.5 : 1,
          cursor: exportableExams.length === 0 ? 'not-allowed' : 'pointer',
        }}
        title="Download calendar file for Apple Calendar, Google Calendar, Outlook"
      >
        <Download size={14} />
        {compact ? 'Export .ics' : 'Add to calendar (.ics)'}
      </button>
      {config?.nesaUrl && (
        <a
          href={config.nesaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            textDecoration: 'none',
          }}
        >
          NESA timetable
          <ExternalLink size={14} />
        </a>
      )}
      {config?.nesaPdfUrl && (
        <a
          href={config.nesaPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '11px', color: 'var(--text-muted)' }}
        >
          Download PDF timetable
        </a>
      )}
      <span style={{ fontSize: '11px', color: 'var(--interactive-muted)', maxWidth: '220px' }}>
        {config?.source ? `${config.source}. ` : ''}
        ICS uses Australia/Sydney. Confirm your personal timetable on Students Online.
      </span>
    </div>
  );

  const toggleDraftSubject = (name) => {
    setDraftSubjects((prev) => {
      if (prev.includes(name)) return prev.filter((s) => s !== name);
      return [...prev, name];
    });
  };

  const applyMySubjects = () => {
    const saved = saveMySubjects(draftSubjects);
    setMySubjects(saved);
    setEditingSubjects(false);
  };

  const startEditing = () => {
    setDraftSubjects(mySubjects);
    setEditingSubjects(true);
  };

  if (loadError) return null;
  if (!config) return null;

  const cardStyle = {
    marginTop: '20px',
    padding: '16px 20px',
    background: 'var(--bg-secondary)',
    borderRadius: '18px',
    border: '1px solid var(--border-subtle)',
    boxShadow: 'var(--elevation-low)',
  };

  const pinnedSubjectsBar = isHome && mySubjects.length > 0 && !editingSubjects && (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '8px',
      marginBottom: '12px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Tracking: {mySubjects.join(' · ')}
      </div>
      <button
        type="button"
        onClick={startEditing}
        className="btn-secondary"
        style={{ fontSize: '11px', padding: '4px 8px' }}
      >
        <Settings2 size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
        Edit subjects
      </button>
    </div>
  );

  const subjectPicker = isHome && (editingSubjects || mySubjects.length === 0) && (
    <div style={{ marginBottom: editingSubjects && mySubjects.length > 0 ? '16px' : 0 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--header-secondary)', textTransform: 'uppercase' }}>
          My subjects
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {draftSubjects.length} selected
        </span>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
        Pin the subjects you&apos;re sitting so home shows <strong>your</strong> next exam - not everyone&apos;s English Paper 1.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {portalSubjects.map((name) => {
          const selected = draftSubjects.includes(name);
          const hasTimetableExam = schedulableSubjects.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleDraftSubject(name)}
              title={hasTimetableExam ? undefined : 'Not on the loaded written exam timetable'}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: hasTimetableExam ? 'none' : '1px dashed var(--interactive-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: 1,
                backgroundColor: selected ? 'var(--brand-experiment)' : 'var(--bg-elevated)',
                color: selected ? '#fff' : 'var(--interactive-normal)',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={applyMySubjects}
        className="btn-primary"
        style={{ fontSize: '13px' }}
      >
        <Check size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
        Save my subjects
      </button>
    </div>
  );

  if (isHome && mySubjects.length === 0) {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: '16px 24px' }}>
        <div style={{ flex: '1 1 280px' }}>{subjectPicker}</div>
        {exportLinks(true)}
      </div>
    );
  }

  const state = getNextExamState(
    config,
    {
      subjectName,
      pinnedSubjectNames: isHome && mySubjects.length > 0 ? mySubjects : null,
    },
    now
  );

  if (state.status === 'unavailable' || state.status === 'no-subject-exams') {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: '16px 24px' }}>
        <div style={{ flex: '1 1 280px' }}>
          {pinnedSubjectsBar}
          {editingSubjects && subjectPicker}
          {state.status === 'no-subject-exams' && !editingSubjects && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Calendar size={20} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--header-primary)' }}>
                  No timetable match for your subjects
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                We couldn&apos;t find written exams for
                {state.pinnedSubjectNames?.length ? ` ${state.pinnedSubjectNames.join(', ')}` : ' your pinned subjects'} in
                the loaded schedule. Edit subjects or check Students Online.
              </p>
            </>
          )}
        </div>
        {exportLinks(true)}
      </div>
    );
  }

  if (state.status === 'finished') {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: '16px 24px' }}>
        <div style={{ flex: '1 1 280px' }}>
          {isHome && editingSubjects && subjectPicker}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Calendar size={20} color="var(--status-positive)" />
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--header-primary)' }}>
              {state.mode === 'pinned'
                ? 'All your subject exams have finished'
                : state.subjectName
                  ? `All ${state.subjectName} written exams have finished`
                  : `HSC ${state.year} written exams have finished`}
            </span>
          </div>
          {isHome && !editingSubjects && (
            <button type="button" onClick={startEditing} className="btn-secondary" style={{ fontSize: '12px', marginTop: '8px' }}>
              <Settings2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Edit my subjects
            </button>
          )}
        </div>
        {exportLinks(true)}
      </div>
    );
  }

  const { countdown, target, nextUp, upcomingInScope, period, nesaUrl, nesaPdfUrl, year, mode } = state;
  const isImminent = countdown.totalSeconds < 3600;

  const heading =
    mode === 'subject'
      ? `${subjectName} - next exam`
      : mode === 'pinned'
        ? 'Your next exam'
        : 'Next HSC written exam';

  return (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: '16px 24px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: '1 1 280px', width: '100%' }}>
        {isHome && editingSubjects && subjectPicker}

        {pinnedSubjectsBar}

        <div style={{ fontSize: '12px', color: 'var(--header-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
          <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          HSC {year} · {heading}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <CountdownUnit value={countdown.days} label="days" urgent={isImminent} />
          <CountdownUnit value={countdown.hours} label="hrs" urgent={isImminent} />
          <CountdownUnit value={countdown.minutes} label="min" urgent={isImminent} />
          <CountdownUnit value={countdown.seconds} label="sec" urgent={isImminent} />
        </div>

        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--header-primary)', marginBottom: '4px' }}>
            {target.label}
          </div>
          <div style={{ fontSize: '13px', color: isImminent ? 'var(--status-warning)' : 'var(--text-muted)' }}>
            {formatExamDate(target.date, target.time, target.endTime)}
            {target.hscDay != null && ` · HSC Day ${target.hscDay}`}
          </div>
          {nextUp && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Then: {nextUp.label} ({formatExamDate(nextUp.date, nextUp.time, nextUp.endTime)})
            </div>
          )}
        </div>

        {(mode === 'subject' || mode === 'pinned') && upcomingInScope.length > 1 && (
          <div style={{ marginTop: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--header-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              {mode === 'pinned' ? 'Your upcoming exams' : 'Upcoming in this subject'}
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {upcomingInScope.map((exam) => (
                <li key={exam.id} style={{ marginBottom: '4px' }}>
                  {exam.label} - {formatExamDate(exam.date, exam.time, exam.endTime)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'global' && period && (
          <div style={{ fontSize: '12px', color: 'var(--interactive-muted)' }}>
            Exam period: {formatExamDate(period.start)} – {formatExamDate(period.end)}
          </div>
        )}
      </div>

      {exportLinks()}
    </div>
  );
}
