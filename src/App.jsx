import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';

import PortalMasthead from './components/PortalMasthead';
import TodayView from './components/TodayView';
import LibraryView from './components/LibraryView';
import CalendarView from './components/CalendarView';
import CommandPalette from './components/CommandPalette';
import PracticeRoom from './components/PracticeRoom';
import TextbooksView from './components/TextbooksView';
import PaperHistory from './components/PaperHistory';
import StudyNotebook from './components/StudyNotebook';
import AgentCommandCenter from './components/AgentCommandCenter';
import CustomizationMenu from './components/CustomizationMenu';
import FirebaseResetNotice from './components/FirebaseResetNotice';
import { InstallDialog, SignInDialog } from './components/SyncInstallDialogs';
import OnboardingWizard, { hasCompletedOnboarding } from './components/OnboardingWizard';

import { findPaperByIdentifier, getPaperRouteId } from './utils/paperIdentity';
import { loadMySubjects } from './utils/mySubjects';
import {
  COMPLETED_PAPERS_STORAGE_KEY,
  mergeCompletedPapers,
  mergeMySubjects,
  mergeViewedPapers,
  MY_SUBJECTS_STORAGE_KEY,
  notifyStudySyncUpdate,
  readStoredArray,
  sameSerializedValue,
  VIEWED_PAPERS_STORAGE_KEY,
  writeStoredArray,
} from './utils/studySync';
import { loadOpenRouterSettings, saveOpenRouterSettings } from './utils/openRouterKeySettings';
import {
  loadMistakeLog,
  loadPracticeReviews,
  mergeMistakeLog,
  mergePracticeReviews,
  MISTAKE_LOG_STORAGE_KEY,
  notifyPracticeRecordsUpdated,
  PRACTICE_REVIEWS_STORAGE_KEY,
} from './utils/practiceRecords';
import {
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_VARIABLE_KEYS,
  getAccentVars,
  getAppearanceVars,
  loadAppearanceSettings,
} from './utils/appearancePresets';
import { allowanceSeconds, buildLadder, buildWeakSpots } from './utils/practiceLadder';
import { parseLibraryQuery } from './utils/libraryQuery';
import { useExamSchedule } from './utils/useExamSchedule';

import './App.css';
import { useSync } from './components/SyncContext';
import { useAuth } from './components/AuthContext';

const FIREBASE_RESET_NOTICE_STORAGE_KEY = 'hsc_new_firebase_2026';
const TIMER_STORAGE_KEY = 'hsc_timer_duration_secs';
const TIMER_CEILING_SECONDS = 4 * 60 * 60;
/** NSW written papers run three hours plus reading time; used to size the clock. */
const DEFAULT_PAPER_MINUTES = 180;

function slugify(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function App() {
  const { data, updateRemote, updateRemoteFields } = useSync();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();

  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [showFirebaseResetNotice, setShowFirebaseResetNotice] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    try {
      setShowFirebaseResetNotice(!localStorage.getItem(FIREBASE_RESET_NOTICE_STORAGE_KEY));
    } catch (error) {
      // If storage is unavailable, continue to make the migration notice visible for this visit.
      setShowFirebaseResetNotice(true);
    }
  }, []);

  // First visit opens the questionnaire; the bare sign-in prompt is only used
  // for returning students who set up before onboarding existed.
  useEffect(() => {
    if (authLoading) return;
    if (!hasCompletedOnboarding()) {
      setShowOnboarding(true);
      return;
    }
    const hasSeenPrompt = localStorage.getItem('hsc_has_seen_signin_prompt');
    if (!hasSeenPrompt && !user) setShowSignInPrompt(true);
  }, [authLoading, user]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
      localStorage.setItem('hsc_has_seen_signin_prompt', 'true');
      setShowSignInPrompt(false);
    } catch (e) {
      console.error(e);
    }
  };

  const completeOnboarding = useCallback(({ subjects: chosen, level, startStyle }) => {
    setMySubjects(chosen);
    setSelectedLevel(level);
    setSection(startStyle === 'browse' ? 'library' : 'today');
    setShowOnboarding(false);
    setShowSignInPrompt(false);
    try {
      localStorage.setItem('hsc_has_seen_signin_prompt', 'true');
    } catch (error) {
      // The prompt simply reappears next visit if storage is unavailable.
    }
    notifyStudySyncUpdate();
  }, []);

  const handleSkipSignIn = () => {
    localStorage.setItem('hsc_has_seen_signin_prompt', 'true');
    setShowSignInPrompt(false);
  };

  const dismissFirebaseResetNotice = () => {
    try {
      localStorage.setItem(FIREBASE_RESET_NOTICE_STORAGE_KEY, 'acknowledged');
    } catch (error) {
      // The state update still lets a user continue when browser storage is unavailable.
    }
    setShowFirebaseResetNotice(false);
  };

  // Library data
  const [subjects, setSubjects] = useState([]);
  const [schools, setSchools] = useState([]);
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Navigation
  const [section, setSection] = useState('today');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);

  // Study state
  const [selectedLevel, setSelectedLevel] = useState(12);
  const [mySubjects, setMySubjects] = useState(() => loadMySubjects());
  const [reviews, setReviews] = useState(() => loadPracticeReviews());
  const [mistakes, setMistakes] = useState(() => loadMistakeLog());
  const [completedPapers, setCompletedPapers] = useState(() => readStoredArray(COMPLETED_PAPERS_STORAGE_KEY));
  const [bookmarks, setBookmarks] = useState(() => {
    const saved = localStorage.getItem('hsc_bookmarks');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    if (data && data.bookmarks) {
      setBookmarks(new Set(data.bookmarks));
      localStorage.setItem('hsc_bookmarks', JSON.stringify(data.bookmarks));
    }
  }, [data?.bookmarks]);

  const hasRestoredStudySyncRef = useRef(false);

  useEffect(() => {
    const syncMySubjects = () => setMySubjects(loadMySubjects());
    const syncRecords = () => {
      setReviews(loadPracticeReviews());
      setMistakes(loadMistakeLog());
    };
    const syncHistory = () => setCompletedPapers(readStoredArray(COMPLETED_PAPERS_STORAGE_KEY));
    const handleStorage = (event) => {
      if (event.key === MY_SUBJECTS_STORAGE_KEY) syncMySubjects();
      if (event.key === PRACTICE_REVIEWS_STORAGE_KEY || event.key === MISTAKE_LOG_STORAGE_KEY) syncRecords();
      if (event.key === COMPLETED_PAPERS_STORAGE_KEY) syncHistory();
    };

    window.addEventListener('hsc:my-subjects-updated', syncMySubjects);
    window.addEventListener('hsc:study-records-updated', syncRecords);
    window.addEventListener('hsc:history-updated', syncHistory);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('hsc:my-subjects-updated', syncMySubjects);
      window.removeEventListener('hsc:study-records-updated', syncRecords);
      window.removeEventListener('hsc:history-updated', syncHistory);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!user || !data) return;

    if (hasRestoredStudySyncRef.current) {
      const remoteSubjects = mergeMySubjects(data.mySubjects, []);
      const remoteViewed = mergeViewedPapers(data.viewedPapers, []);
      const remoteCompleted = mergeCompletedPapers(data.completedPapers, []);
      const remoteReviews = mergePracticeReviews(data.practiceReviews, []);
      const remoteMistakes = mergeMistakeLog(data.mistakeLog, []);
      let didRestoreLocalData = false;

      if (!sameSerializedValue(loadMySubjects(), remoteSubjects)) {
        localStorage.setItem(MY_SUBJECTS_STORAGE_KEY, JSON.stringify(remoteSubjects));
        setMySubjects(remoteSubjects);
        didRestoreLocalData = true;
      }
      if (!sameSerializedValue(readStoredArray(VIEWED_PAPERS_STORAGE_KEY), remoteViewed)) {
        writeStoredArray(VIEWED_PAPERS_STORAGE_KEY, remoteViewed);
        didRestoreLocalData = true;
      }
      if (!sameSerializedValue(readStoredArray(COMPLETED_PAPERS_STORAGE_KEY), remoteCompleted)) {
        writeStoredArray(COMPLETED_PAPERS_STORAGE_KEY, remoteCompleted);
        didRestoreLocalData = true;
      }
      if (!sameSerializedValue(loadPracticeReviews(), remoteReviews)) {
        writeStoredArray(PRACTICE_REVIEWS_STORAGE_KEY, remoteReviews);
        didRestoreLocalData = true;
      }
      if (!sameSerializedValue(loadMistakeLog(), remoteMistakes)) {
        writeStoredArray(MISTAKE_LOG_STORAGE_KEY, remoteMistakes);
        didRestoreLocalData = true;
      }
      if (didRestoreLocalData) {
        notifyStudySyncUpdate();
        notifyPracticeRecordsUpdated();
      }
      return;
    }

    const localSubjects = loadMySubjects();
    const localViewed = readStoredArray(VIEWED_PAPERS_STORAGE_KEY);
    const localCompleted = readStoredArray(COMPLETED_PAPERS_STORAGE_KEY);
    const localReviews = loadPracticeReviews();
    const localMistakes = loadMistakeLog();
    const mergedSubjects = mergeMySubjects(data.mySubjects, localSubjects);
    const mergedViewed = mergeViewedPapers(data.viewedPapers, localViewed);
    const mergedCompleted = mergeCompletedPapers(data.completedPapers, localCompleted);
    const mergedReviews = mergePracticeReviews(data.practiceReviews, localReviews);
    const mergedMistakes = mergeMistakeLog(data.mistakeLog, localMistakes);

    hasRestoredStudySyncRef.current = true;

    if (!sameSerializedValue(localSubjects, mergedSubjects)) {
      localStorage.setItem(MY_SUBJECTS_STORAGE_KEY, JSON.stringify(mergedSubjects));
      setMySubjects(mergedSubjects);
    }
    if (!sameSerializedValue(localViewed, mergedViewed)) writeStoredArray(VIEWED_PAPERS_STORAGE_KEY, mergedViewed);
    if (!sameSerializedValue(localCompleted, mergedCompleted)) writeStoredArray(COMPLETED_PAPERS_STORAGE_KEY, mergedCompleted);
    if (!sameSerializedValue(localReviews, mergedReviews)) writeStoredArray(PRACTICE_REVIEWS_STORAGE_KEY, mergedReviews);
    if (!sameSerializedValue(localMistakes, mergedMistakes)) writeStoredArray(MISTAKE_LOG_STORAGE_KEY, mergedMistakes);
    notifyStudySyncUpdate();
    notifyPracticeRecordsUpdated();

    const remotePatch = {};
    if (!sameSerializedValue(data.mySubjects || [], mergedSubjects)) remotePatch.mySubjects = mergedSubjects;
    if (!sameSerializedValue(data.viewedPapers || [], mergedViewed)) remotePatch.viewedPapers = mergedViewed;
    if (!sameSerializedValue(data.completedPapers || [], mergedCompleted)) remotePatch.completedPapers = mergedCompleted;
    if (!sameSerializedValue(data.practiceReviews || [], mergedReviews)) remotePatch.practiceReviews = mergedReviews;
    if (!sameSerializedValue(data.mistakeLog || [], mergedMistakes)) remotePatch.mistakeLog = mergedMistakes;
    updateRemoteFields(remotePatch);
  }, [data, updateRemoteFields, user]);

  useEffect(() => {
    if (!user) return undefined;

    const syncSubjects = () => updateRemote('mySubjects', loadMySubjects());
    const syncHistory = () => updateRemoteFields({
      viewedPapers: readStoredArray(VIEWED_PAPERS_STORAGE_KEY),
      completedPapers: readStoredArray(COMPLETED_PAPERS_STORAGE_KEY),
    });
    const syncPracticeRecords = () => updateRemoteFields({
      practiceReviews: loadPracticeReviews(),
      mistakeLog: loadMistakeLog(),
    });

    window.addEventListener('hsc:my-subjects-updated', syncSubjects);
    window.addEventListener('hsc:history-updated', syncHistory);
    window.addEventListener('hsc:study-records-updated', syncPracticeRecords);
    return () => {
      window.removeEventListener('hsc:my-subjects-updated', syncSubjects);
      window.removeEventListener('hsc:history-updated', syncHistory);
      window.removeEventListener('hsc:study-records-updated', syncPracticeRecords);
    };
  }, [updateRemote, updateRemoteFields, user]);

  useEffect(() => {
    if (!user) hasRestoredStudySyncRef.current = false;
  }, [user]);

  // Appearance
  const [appearance, setAppearance] = useState(loadAppearanceSettings);

  useEffect(() => {
    if (data && data.appearance && Object.keys(data.appearance).length > 0) {
      setAppearance(data.appearance);
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(data.appearance));
    }
  }, [data?.appearance]);

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => (
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  ));
  const theme = appearance.mode === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : appearance.mode;

  useEffect(() => {
    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const updateSystemPreference = (event) => setSystemPrefersDark(event.matches);

    if (mediaQuery) {
      setSystemPrefersDark(mediaQuery.matches);
      mediaQuery.addEventListener('change', updateSystemPreference);
    }
    return () => {
      if (mediaQuery) mediaQuery.removeEventListener('change', updateSystemPreference);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.setAttribute('data-theme', theme);
    root.setAttribute('data-palette', appearance.preset);
    root.setAttribute('data-density', appearance.density);
    root.setAttribute('data-layout', appearance.layout);

    APPEARANCE_VARIABLE_KEYS.forEach((key) => root.style.removeProperty(key));
    const vars = { ...getAppearanceVars(appearance.preset, theme), ...getAccentVars(appearance.accent, theme) };
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));

    try {
      localStorage.setItem('hsc_theme', theme);
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    } catch (e) {
      // ignore
    }
  }, [appearance, theme]);

  const updateAppearance = useCallback((patch) => {
    setAppearance((current) => {
      const next = { ...current, ...patch };
      updateRemote('appearance', next);
      return next;
    });
  }, [updateRemote]);

  const [openRouterSettings, setOpenRouterSettings] = useState(loadOpenRouterSettings);
  const updateOpenRouterSettings = useCallback((patch) => {
    setOpenRouterSettings((current) => {
      const next = { ...current, ...patch };
      saveOpenRouterSettings(next);
      return next;
    });
  }, []);

  // Routing
  const [activePaperId, setActivePaperId] = useState(() => (
    new URLSearchParams(window.location.search).get('paper')
  ));
  const [locationSnapshot, setLocationSnapshot] = useState(() => ({
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || '',
  }));
  const [shareNotice, setShareNotice] = useState('');
  const shareNoticeTimer = useRef(null);
  const paperReturnToRef = useRef(null);

  const readLocation = () => ({
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || '',
  });

  useEffect(() => {
    const handlePopState = () => setLocationSnapshot(readLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => () => {
    if (shareNoticeTimer.current) clearTimeout(shareNoticeTimer.current);
  }, []);

  useEffect(() => {
    fetch('/papers.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load paper indexes.');
        return res.json();
      })
      .then((payload) => {
        setSubjects(payload.subjects || []);
        setSchools(payload.schools || []);
        setPapers(payload.papers || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // A `?subject=` deep link opens the library already filtered to that subject.
  const hasReadSubjectParamRef = useRef(false);
  useEffect(() => {
    if (hasReadSubjectParamRef.current || subjects.length === 0) return;
    hasReadSubjectParamRef.current = true;

    const params = new URLSearchParams(window.location.search || '');
    const subjectParam = params.get('subject');
    if (!subjectParam) return;

    const match = subjects.find((name) => slugify(name) === subjectParam);
    if (!match) return;
    setLibraryQuery(match.toLowerCase());
    setSection('library');
  }, [subjects]);

  // Keep the URL in step with the subject the library is reading.
  const librarySubjectIndex = useMemo(() => {
    const facet = parseLibraryQuery(libraryQuery, { subjects }).facets.find((entry) => entry.type === 'subject');
    return facet ? facet.value : null;
  }, [libraryQuery, subjects]);

  useEffect(() => {
    if (activePaperId) return;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const slug = librarySubjectIndex === null ? null : slugify(subjects[librarySubjectIndex]);

    if (slug) {
      if (params.get('subject') === slug) return;
      params.set('subject', slug);
    } else {
      if (!params.has('subject')) return;
      params.delete('subject');
    }

    const search = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/${search}${url.hash}`);
    setLocationSnapshot(readLocation());
  }, [librarySubjectIndex, subjects, activePaperId]);

  const paperRouteId = useMemo(() => (
    new URLSearchParams(locationSnapshot.search || '').get('paper')
  ), [locationSnapshot.search]);

  useEffect(() => {
    if (paperRouteId !== activePaperId) setActivePaperId(paperRouteId);
  }, [paperRouteId, activePaperId]);

  const activePaper = useMemo(() => (
    activePaperId ? findPaperByIdentifier(papers, activePaperId) : null
  ), [papers, activePaperId]);

  const openPaper = useCallback((paper, { replace = false } = {}) => {
    paperReturnToRef.current = readLocation();
    const params = new URLSearchParams(window.location.search);
    params.set('paper', getPaperRouteId(paper));
    window.history[replace ? 'replaceState' : 'pushState']({}, '', `/?${params.toString()}`);
    setLocationSnapshot(readLocation());
    setActivePaperId(getPaperRouteId(paper));
  }, []);

  const closePaper = useCallback(() => {
    const returnTo = paperReturnToRef.current || { pathname: '/', search: '', hash: '' };
    const params = new URLSearchParams(returnTo.search);
    params.delete('paper');
    const search = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/${search}${returnTo.hash || ''}`);
    setLocationSnapshot(readLocation());
    setActivePaperId(null);
    paperReturnToRef.current = null;
  }, []);

  /**
   * Begin a sitting at a chosen allowance. The practice room reads its clock
   * from `hsc_timer_duration_secs`, so setting that before opening the paper is
   * all it takes for the ladder to control the time on the page.
   */
  const beginSitting = useCallback((paper, allowanceId) => {
    const seconds = allowanceSeconds(DEFAULT_PAPER_MINUTES, allowanceId);
    if (seconds) {
      try {
        localStorage.setItem(TIMER_STORAGE_KEY, String(Math.min(seconds, TIMER_CEILING_SECONDS)));
      } catch (e) {
        // The room falls back to its own saved duration when storage is unavailable.
      }
    }
    openPaper(paper);
  }, [openPaper]);

  const toggleBookmark = useCallback((viewno) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(viewno)) next.delete(viewno); else next.add(viewno);
      const list = Array.from(next);
      localStorage.setItem('hsc_bookmarks', JSON.stringify(list));
      updateRemote('bookmarks', list);
      return next;
    });
  }, [updateRemote]);

  const addCalendarEvent = useCallback(({ title, date, description = '', color = 'blue' }) => {
    try {
      const saved = JSON.parse(localStorage.getItem('hsc_assessments') || '[]');
      const next = [...saved, {
        id: Date.now(),
        subject: title,
        day: date.split('T')[0],
        period: description || 'Agent-scheduled',
        topics: description || title,
        weight: '',
        agentColor: color,
      }];
      localStorage.setItem('hsc_assessments', JSON.stringify(next));
      updateRemote('assessments', next);
    } catch (e) {
      console.warn('addCalendarEvent failed:', e);
    }
  }, [updateRemote]);

  const flashShareNotice = (message) => {
    setShareNotice(message);
    if (shareNoticeTimer.current) clearTimeout(shareNoticeTimer.current);
    shareNoticeTimer.current = setTimeout(() => setShareNotice(''), 1800);
  };

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const success = document.execCommand('copy');
    document.body.removeChild(input);
    return success;
  };

  const sharePaper = async (paper) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('paper', getPaperRouteId(paper));
    const shareUrl = url.toString();

    try {
      if (navigator.share) {
        await navigator.share({ title: paper.n, text: 'Open this HSC paper in The Paper Room', url: shareUrl });
        flashShareNotice('Share sheet opened');
        return;
      }
      await copyText(shareUrl);
      flashShareNotice('Share link copied');
    } catch (e) {
      try {
        await copyText(shareUrl);
        flashShareNotice('Share link copied');
      } catch (copyErr) {
        window.prompt('Copy this share link', shareUrl);
      }
    }
  };

  // Derived study state
  const ladder = useMemo(() => buildLadder({ subjects: mySubjects, reviews }), [mySubjects, reviews]);

  const satPaperIds = useMemo(() => {
    const identities = new Set();
    completedPapers.forEach((entry) => {
      const identity = entry?.paperId || entry?.key || '';
      if (identity) identities.add(String(identity));
    });
    reviews.forEach((review) => {
      if (review?.paperId) identities.add(String(review.paperId));
    });
    return identities;
  }, [completedPapers, reviews]);

  const schedule = useExamSchedule(mySubjects);

  // ⌘K opens the command line from anywhere except inside the practice room.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const askAgent = useCallback(() => {
    setIsPaletteOpen(false);
    setIsAgentOpen(true);
  }, []);

  const navigateFromPalette = useCallback((target, query) => {
    if (target === 'library' && typeof query === 'string') setLibraryQuery(query);
    setSection(target);
  }, []);

  const runhead = useMemo(() => {
    const todayLabel = new Date().toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
    const firstWritten = schedule.firstWritten;

    if (section === 'library') {
      return `${papers.length.toLocaleString()} papers · ${subjects.length} subjects · ${schools.length} schools`;
    }
    if (firstWritten) {
      return `${todayLabel} · ${firstWritten.daysAway} days to first written exam`;
    }
    return todayLabel;
  }, [section, papers.length, subjects.length, schools.length, schedule.firstWritten]);

  const agentContext = useMemo(() => ({
    papers,
    subjects,
    schools,
    bookmarks,
    toggleBookmark,
    addCalendarEvent,
    selectedLevel,
    openRouterSettings,
    // Study state, so the agent can answer from data instead of guessing.
    mySubjects,
    ladder,
    reviews,
    mistakes,
    exams: schedule.myExams,
    satPaperIds,
    weakSpots: buildWeakSpots(mistakes, 6),
    beginSitting,
    goToSection: setSection,
  }), [
    papers, subjects, schools, bookmarks, toggleBookmark, addCalendarEvent,
    selectedLevel, openRouterSettings, mySubjects, ladder, reviews, mistakes,
    schedule.myExams, satPaperIds, beginSitting,
  ]);

  const firebaseResetNotice = (
    <FirebaseResetNotice isOpen={showFirebaseResetNotice} onDismiss={dismissFirebaseResetNotice} />
  );

  // ── The practice room takes over the whole page ─────────────────────────
  if (paperRouteId) {
    if (loading) {
      return (
        <div className="portal" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <RefreshCw size={26} className="spin" />
            <h3 style={{ marginTop: '12px' }}>Loading paper</h3>
          </div>
          {firebaseResetNotice}
          <Analytics />
        </div>
      );
    }

    if (error || !activePaper) {
      return (
        <div className="portal" style={{ display: 'grid', placeItems: 'center', padding: '24px' }}>
          <div className="card" style={{ maxWidth: '620px', width: '100%', borderColor: 'var(--color-text)' }}>
            <div className="kick">Not found</div>
            <h3>{error ? 'Could not open this paper' : 'Paper not found'}</h3>
            <p className="card-body">{error || 'This link does not match a paper in the index.'}</p>
            <button type="button" className="btn btn-primary" onClick={closePaper}>Back to the portal</button>
          </div>
          {firebaseResetNotice}
          <Analytics />
        </div>
      );
    }

    return (
      <>
        <PracticeRoom
          paper={activePaper}
          subjectName={subjects[activePaper.s]}
          schoolName={schools[activePaper.h]}
          onClose={closePaper}
          allPapers={papers}
          subjects={subjects}
          schools={schools}
          onSharePaper={() => sharePaper(activePaper)}
          onSelectPaper={openPaper}
          agentContext={agentContext}
        />
        {firebaseResetNotice}
      </>
    );
  }

  // ── The portal proper ───────────────────────────────────────────────────
  return (
    <div className="portal">
      <PortalMasthead
        section={section}
        onSectionChange={setSection}
        runhead={runhead}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onOpenCustomise={() => setIsCustomizationOpen(true)}
      />

      <div className="portal-body">
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: '80px 0', gap: '12px' }}>
            <RefreshCw size={26} className="spin" />
            <p className="dim">Setting the index…</p>
          </div>
        ) : error ? (
          <div style={{ padding: '40px var(--gutter)' }}>
            <div className="card" style={{ borderColor: 'var(--status-danger)' }}>
              <div className="kick" style={{ color: 'var(--status-danger)' }}>Load error</div>
              <p className="card-body">{error}</p>
            </div>
          </div>
        ) : section === 'today' ? (
          <TodayView
            papers={papers}
            subjects={subjects}
            schools={schools}
            mySubjects={mySubjects}
            reviews={reviews}
            mistakes={mistakes}
            exams={schedule.myExams}
            selectedLevel={selectedLevel}
            satPaperIds={satPaperIds}
            showPrescription={appearance.showRecommendations !== false}
            onBeginSitting={beginSitting}
            onOpenSubject={(subjectName) => {
              setLibraryQuery(subjectName.toLowerCase());
              setSection('library');
            }}
            onGoLibrary={() => setSection('library')}
            onGoNotebook={() => setSection('notebook')}
            onInstall={() => setShowInstallDialog(true)}
          />
        ) : section === 'library' ? (
          <LibraryView
            papers={papers}
            subjects={subjects}
            schools={schools}
            ladder={ladder}
            selectedLevel={selectedLevel}
            onLevelChange={setSelectedLevel}
            query={libraryQuery}
            onQueryChange={setLibraryQuery}
            bookmarks={bookmarks}
            onToggleBookmark={(paper) => toggleBookmark(`${paper.v}_${paper.n}`)}
            satPaperIds={satPaperIds}
            onOpenPaper={openPaper}
            onBeginSitting={beginSitting}
            onAsk={askAgent}
          />
        ) : section === 'calendar' ? (
          <CalendarView
            exams={schedule.myExams}
            ladder={ladder}
            onAssessmentsChanged={(next) => updateRemote('assessments', next)}
          />
        ) : section === 'notebook' ? (
          <div className="section-pane pane-scroll">
            <StudyNotebook onSelectPaper={(paperId) => {
              const match = findPaperByIdentifier(papers, paperId);
              if (match) openPaper(match);
            }} />
          </div>
        ) : section === 'history' ? (
          <div className="section-pane pane-scroll">
            <PaperHistory
              allPapers={papers}
              subjects={subjects}
              schools={schools}
              onSelectPaper={openPaper}
            />
          </div>
        ) : (
          <TextbooksView />
        )}
      </div>

      {shareNotice && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-text)',
            boxShadow: 'var(--shadow-md)',
            padding: '8px 14px',
            fontSize: '13px',
            zIndex: 1500,
          }}
        >
          {shareNotice}
        </div>
      )}

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        papers={papers}
        subjects={subjects}
        schools={schools}
        ladder={ladder}
        selectedLevel={selectedLevel}
        onBeginSitting={beginSitting}
        onAsk={askAgent}
        onNavigate={navigateFromPalette}
      />

      <CustomizationMenu
        isOpen={isCustomizationOpen}
        settings={appearance}
        onChange={updateAppearance}
        aiSettings={openRouterSettings}
        onAiSettingsChange={updateOpenRouterSettings}
        onClose={() => setIsCustomizationOpen(false)}
      />

      <AgentCommandCenter
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        appContext={agentContext}
      />

      <OnboardingWizard
        isOpen={showOnboarding && !showFirebaseResetNotice && !loading}
        portalSubjects={subjects}
        initialSubjects={mySubjects}
        appearance={appearance}
        onAppearanceChange={updateAppearance}
        onSignIn={handleSignIn}
        isSignedIn={Boolean(user)}
        onComplete={completeOnboarding}
        onDismiss={() => setShowOnboarding(false)}
      />

      <SignInDialog
        isOpen={showSignInPrompt && !showOnboarding && !showFirebaseResetNotice}
        onSignIn={handleSignIn}
        onDismiss={handleSkipSignIn}
      />

      <InstallDialog isOpen={showInstallDialog} onClose={() => setShowInstallDialog(false)} />

      {firebaseResetNotice}
      <Analytics />
    </div>
  );
}
