import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ClipboardCheck, FileText, Filter, Target, Trash2 } from 'lucide-react';
import { loadMistakeLog, loadPracticeReviews, removeMistake } from '../utils/practiceRecords';

function formatDate(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatScore(review) {
  const score = Number(review?.score);
  const total = Number(review?.totalMarks);
  if (Number.isFinite(score) && Number.isFinite(total) && total > 0) {
    return `${score}/${total} · ${Math.round((score / total) * 100)}%`;
  }
  if (Number.isFinite(score)) return `${score} marks recorded`;
  return 'Score not recorded';
}

function formatDuration(seconds) {
  const minutes = Math.round(Math.max(0, Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function StudyNotebook({ onSelectPaper }) {
  const [activeTab, setActiveTab] = useState('mistakes');
  const [mistakes, setMistakes] = useState(loadMistakeLog);
  const [reviews, setReviews] = useState(loadPracticeReviews);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    const refresh = () => {
      setMistakes(loadMistakeLog());
      setReviews(loadPracticeReviews());
    };
    const onStorage = (event) => {
      if (event.key === 'hsc_mistake_log' || event.key === 'hsc_practice_reviews') refresh();
    };
    window.addEventListener('hsc:study-records-updated', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hsc:study-records-updated', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const categories = useMemo(() => ['All', ...new Set(mistakes.map((mistake) => mistake.category).filter(Boolean))], [mistakes]);
  const filteredMistakes = selectedCategory === 'All'
    ? mistakes
    : mistakes.filter((mistake) => mistake.category === selectedCategory);
  const weakTopics = useMemo(() => {
    const counts = new Map();
    mistakes.forEach((mistake) => {
      const topic = String(mistake.topic || '').trim();
      if (topic) counts.set(topic, (counts.get(topic) || 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3);
  }, [mistakes]);

  const deleteMistake = (id) => {
    removeMistake(id);
    setMistakes(loadMistakeLog());
  };

  return (
    <div className="study-notebook">
      <section className="study-notebook-hero">
        <div>
          <div className="eyebrow">Personal study record</div>
          <h2>Your mistake notebook</h2>
          <p>Capture the errors that matter, then come back to them before your next paper.</p>
        </div>
        <div className="study-notebook-metrics">
          <div><span>Mistakes logged</span><strong>{mistakes.length}</strong></div>
          <div><span>Reviews saved</span><strong>{reviews.length}</strong></div>
          <div><span>Topics to revisit</span><strong>{weakTopics.length}</strong></div>
        </div>
      </section>

      {weakTopics.length > 0 && (
        <section className="study-notebook-focus">
          <Target size={18} />
          <div>
            <span>Focus next</span>
            <strong>{weakTopics.map(([topic, count]) => `${topic} (${count})`).join(' · ')}</strong>
          </div>
        </section>
      )}

      <div className="study-notebook-tabs" role="tablist" aria-label="Study notebook sections">
        <button type="button" role="tab" aria-selected={activeTab === 'mistakes'} className={activeTab === 'mistakes' ? 'is-active' : ''} onClick={() => setActiveTab('mistakes')}>
          <BookOpenCheck size={16} /> Mistakes ({mistakes.length})
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'reviews'} className={activeTab === 'reviews' ? 'is-active' : ''} onClick={() => setActiveTab('reviews')}>
          <ClipboardCheck size={16} /> Reviews ({reviews.length})
        </button>
      </div>

      {activeTab === 'mistakes' ? (
        <section className="study-notebook-section">
          <div className="study-notebook-section-header">
            <div>
              <h3>Errors to revisit</h3>
              <p>Each note is private to your account and will sync after you sign in.</p>
            </div>
            {categories.length > 1 && (
              <label className="study-notebook-filter">
                <Filter size={15} />
                <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} aria-label="Filter mistakes by type">
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            )}
          </div>

          {filteredMistakes.length === 0 ? (
            <div className="study-notebook-empty">
              <BookOpenCheck size={26} />
              <h3>No mistakes logged yet</h3>
              <p>Finish a paper and choose <strong>Review</strong> to save the questions and ideas you want to improve.</p>
            </div>
          ) : (
            <div className="study-notebook-list">
              {filteredMistakes.map((mistake) => (
                <article className="study-notebook-mistake" key={mistake.id}>
                  <div className="study-notebook-mistake-meta">
                    <span>{mistake.subjectName || 'HSC paper'}</span>
                    <span>{formatDate(mistake.createdAt)}</span>
                  </div>
                  <div className="study-notebook-mistake-title">
                    <h4>{mistake.questionId ? `Question ${mistake.questionId}` : 'Unspecified question'}</h4>
                    <span>{mistake.category || 'Other'}</span>
                  </div>
                  {mistake.topic && <div className="study-notebook-topic">{mistake.topic}</div>}
                  <p>{mistake.note}</p>
                  <div className="study-notebook-card-actions">
                    <button type="button" onClick={() => onSelectPaper?.(mistake.paperId)}><FileText size={15} /> Open paper</button>
                    <button type="button" onClick={() => deleteMistake(mistake.id)} aria-label="Delete mistake"><Trash2 size={15} /> Remove</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="study-notebook-section">
          <div className="study-notebook-section-header">
            <div>
              <h3>Practice reviews</h3>
              <p>Track performance, confidence, and the improvement you intend to make next time.</p>
            </div>
          </div>
          {reviews.length === 0 ? (
            <div className="study-notebook-empty">
              <ClipboardCheck size={26} />
              <h3>No paper reviews yet</h3>
              <p>After marking a paper complete, add a quick review to begin building your study record.</p>
            </div>
          ) : (
            <div className="study-notebook-list study-notebook-review-list">
              {reviews.map((review) => (
                <article className="study-notebook-review" key={review.id}>
                  <div>
                    <span className="study-notebook-review-subject">{review.subjectName || 'HSC paper'}</span>
                    <h4>{review.paperName || 'Paper review'}</h4>
                    <p>{formatDate(review.createdAt)} · {formatDuration(review.timeSpent)} · Confidence {review.confidence || '—'}/5</p>
                    {review.reflection && <blockquote>{review.reflection}</blockquote>}
                  </div>
                  <div className="study-notebook-review-side">
                    <strong>{formatScore(review)}</strong>
                    <button type="button" onClick={() => onSelectPaper?.(review.paperId)}><FileText size={15} /> Open paper</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
