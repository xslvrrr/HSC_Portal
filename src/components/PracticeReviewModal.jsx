import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CornerDownRight, Gauge, Plus, X } from 'lucide-react';
import { loadPracticeReviews, saveMistake, savePracticeReview } from '../utils/practiceRecords';
import { MAX_RUNG, getAllowanceForRung, readSubjectForm } from '../utils/practiceLadder';
import { useEscapeKey } from '../utils/useEscapeKey';
import { usePresence } from '../utils/usePresence';

const MISTAKE_CATEGORIES = [
  'Knowledge gap',
  'Misread question',
  'Method — wrong approach',
  'Calculation slip',
  'Time management',
  'Exam technique',
  'Other',
];

function formatTimeSpent(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.round(safeSeconds / 60);
  if (minutes < 60) return `${minutes} m recorded`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m recorded`;
}

function isKnownMark(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function getQuestionOptions(metadata) {
  const questions = Array.isArray(metadata?.questions) ? metadata.questions : [];
  return questions.flatMap((question) => {
    const topLevel = {
      value: String(question.id),
      label: `Question ${question.id}${isKnownMark(question.marks) ? ` · ${question.marks} mark${Number(question.marks) === 1 ? '' : 's'}` : ''}`,
      marks: isKnownMark(question.marks) ? Number(question.marks) : null,
    };
    const subparts = (Array.isArray(question.subparts) ? question.subparts : []).map((subpart) => ({
      value: `${question.id}${subpart.id}`,
      label: `Question ${question.id}${subpart.id}${isKnownMark(subpart.marks) ? ` · ${subpart.marks} mark${Number(subpart.marks) === 1 ? '' : 's'}` : ''}`,
      marks: isKnownMark(subpart.marks) ? Number(subpart.marks) : null,
    }));
    return [topLevel, ...subparts];
  });
}

/**
 * Post-sitting review — the moment the ladder moves.
 *
 * Everything the portal knows about your form comes from this dialog, so it
 * shows the consequence of the marks you enter before you save them.
 */
export default function PracticeReviewModal({
  paper,
  subjectName,
  schoolName,
  metadata,
  timeSpent,
  allowanceLabel = 'to time',
  onClose,
  onSaved,
}) {
  // The modal is mounted conditionally by its parent, so it opens straight into
  // the entered stage and only the exit needs holding.
  const presence = usePresence(true, 220);
  useEscapeKey(true, onClose);

  const questionOptions = useMemo(() => getQuestionOptions(metadata), [metadata]);
  const suggestedTotal = isKnownMark(metadata?.totalMarks) ? Number(metadata.totalMarks) : '';

  const [score, setScore] = useState('');
  const [totalMarks, setTotalMarks] = useState(suggestedTotal);
  const [confidence, setConfidence] = useState(3);
  const [reflection, setReflection] = useState('');
  const [questionId, setQuestionId] = useState(questionOptions[0]?.value || '');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState(MISTAKE_CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [draftMistakes, setDraftMistakes] = useState([]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedQuestion = questionOptions.find((option) => option.value === questionId);
  const structureLabel = metadata?.status === 'ready'
    ? `${metadata.questionCount || questionOptions.length} questions${suggestedTotal !== '' ? ` · ${suggestedTotal} marks` : ''}${paper?.w === 1 ? ' · solutions available' : ''}`
    : 'Question structure is not available for this paper yet';

  // What this sitting does to the ladder, worked out before it is saved.
  const projection = useMemo(() => {
    const priorReviews = loadPracticeReviews().filter((review) => review.subjectName === subjectName);
    const before = readSubjectForm(priorReviews);
    const draft = {
      createdAt: Date.now(),
      score: score === '' ? null : Number(score),
      totalMarks: totalMarks === '' ? null : Number(totalMarks),
      confidence,
    };
    const after = readSubjectForm([draft, ...priorReviews]);
    return { before, after };
  }, [subjectName, score, totalMarks, confidence]);

  const nextAllowance = getAllowanceForRung(projection.after.rung);
  const rungMoved = projection.after.rung - projection.before.rung;
  const rungSentence = rungMoved > 0
    ? `This sitting lifts you to rung ${projection.after.rung} — allowance tightens to ${nextAllowance.label}`
    : rungMoved < 0
      ? `This sitting drops you to rung ${projection.after.rung} — the allowance loosens to ${nextAllowance.label}`
      : `This sitting holds you on rung ${projection.after.rung} of ${MAX_RUNG} — allowance stays at ${nextAllowance.label.toLowerCase()}`;

  const addMistake = () => {
    if (!note.trim()) {
      setFormError('Add a short note before saving a mistake.');
      return;
    }
    setDraftMistakes((current) => [...current, {
      questionId: questionId || 'Unspecified',
      questionMarks: selectedQuestion?.marks ?? null,
      topic,
      category,
      note,
    }]);
    setTopic('');
    setNote('');
    setFormError('');
  };

  const removeDraftMistake = (index) => {
    setDraftMistakes((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const saveReview = () => {
    const safeScore = score === '' ? null : Number(score);
    const safeTotal = totalMarks === '' ? null : Number(totalMarks);
    if (safeScore !== null && (!Number.isFinite(safeScore) || safeScore < 0)) {
      setFormError('Enter a valid score, or leave it blank.');
      return;
    }
    if (safeTotal !== null && (!Number.isFinite(safeTotal) || safeTotal <= 0)) {
      setFormError('Enter a valid total mark, or leave it blank.');
      return;
    }
    if (safeScore !== null && safeTotal !== null && safeScore > safeTotal) {
      setFormError('Your score cannot be higher than the total marks.');
      return;
    }

    setIsSaving(true);
    try {
      const review = savePracticeReview({
        paper,
        subjectName,
        schoolName,
        review: {
          score: safeScore,
          totalMarks: safeTotal,
          timeSpent,
          confidence,
          reflection,
          questionCount: metadata?.questionCount || 0,
          metadataStatus: metadata?.status || 'missing',
        },
      });
      draftMistakes.forEach((mistake) => saveMistake({ paper, subjectName, schoolName, mistake }));
      onSaved?.(review, draftMistakes.length);
      onClose();
    } catch (error) {
      setFormError('Your review could not be saved locally. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <div className={`dialog-backdrop is-${presence.stage}`} role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="practice-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <div className="kick">Post-practice review</div>
            <h3 id="practice-review-title" style={{ fontSize: '27px' }}>Turn this paper into your next improvement</h3>
            <p className="num">
              {[schoolName, paper?.y].filter(Boolean).join(' ')}{subjectName ? ` — ${subjectName}` : ''}
              {' · '}{formatTimeSpent(timeSpent)} · {allowanceLabel}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Close review">
            <X size={15} />
          </button>
        </div>

        <div className="dialog-scroll">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <span className="kick">Paper structure</span>
            <span className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: '15px', textAlign: 'right' }}>{structureLabel}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '18px', marginTop: '18px' }}>
            <div className="field">
              <label htmlFor="review-score">Your score</label>
              <input
                id="review-score"
                className="input num"
                type="number"
                min="0"
                step="0.5"
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="field">
              <label htmlFor="review-total">Out of</label>
              <input
                id="review-total"
                className="input num"
                type="number"
                min="1"
                step="0.5"
                value={totalMarks}
                onChange={(event) => setTotalMarks(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <div className="field"><label>How confident did it feel?</label></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div className="seg">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className="seg-opt">
                    <input
                      type="radio"
                      name="review-confidence"
                      checked={confidence === value}
                      onChange={() => setConfidence(value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
              <span className="dim" style={{ fontSize: '11.5px' }}>1 = not confident, 5 = very confident</span>
            </div>
          </div>

          <div style={{ border: '1px solid var(--color-accent)', padding: '13px 15px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-accent)', display: 'flex', flex: 'none' }}><Gauge size={17} /></span>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '16.5px' }}>{rungSentence}</div>
              <div className="dim" style={{ fontSize: '12px', marginTop: '2px' }}>
                {projection.after.streak > 1
                  ? `${projection.after.streak} sittings above 72% in a row. `
                  : ''}
                Your next {subjectName || 'paper'} will be offered at {nextAllowance.label.toLowerCase()}.
              </div>
            </div>
            <span className="rung" style={{ flex: 'none' }}>
              {Array.from({ length: MAX_RUNG }, (_, index) => (
                <i key={index} className={index < projection.after.rung ? 'f' : ''} />
              ))}
            </span>
          </div>

          <div className="field" style={{ marginTop: '20px' }}>
            <label htmlFor="review-reflection">What would you change next time?</label>
            <textarea
              id="review-reflection"
              className="input"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              style={{ minHeight: '62px', fontSize: '13.5px' }}
              placeholder="Plan the extended responses first, then come back to the calculations."
            />
          </div>

          <div style={{ marginTop: '22px', paddingTop: '14px', borderTop: '1px solid var(--color-text)' }}>
            <div className="kick">Mistake notebook</div>
            <h4 style={{ margin: '5px 0 12px' }}>Log the errors worth revisiting</h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="field">
                <label htmlFor="review-question">Question</label>
                {questionOptions.length > 0 ? (
                  <select id="review-question" className="input" value={questionId} onChange={(event) => setQuestionId(event.target.value)}>
                    {questionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input id="review-question" className="input" value={questionId} onChange={(event) => setQuestionId(event.target.value)} placeholder="e.g. 4(b)" />
                )}
              </div>
              <div className="field">
                <label htmlFor="review-category">Category</label>
                <select id="review-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {MISTAKE_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>

            <div className="field" style={{ marginTop: '14px' }}>
              <label htmlFor="review-topic">Topic</label>
              <input id="review-topic" className="input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Buffers and titration curves" />
            </div>

            <div className="field" style={{ marginTop: '14px' }}>
              <label htmlFor="review-note">The mistake, and the rule for next time</label>
              <textarea
                id="review-note"
                className="input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                style={{ minHeight: '56px', fontSize: '13.5px' }}
                placeholder="Describe the mistake, then add the rule or method you will use next time."
              />
            </div>

            <button type="button" className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={addMistake}>
              <Plus size={15} />
              Add mistake
            </button>

            {draftMistakes.map((mistake, index) => (
              <div
                key={`${mistake.questionId}-${index}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', padding: '8px 0', borderTop: '1px solid var(--color-divider)', fontSize: '12.5px' }}
              >
                <span style={{ color: 'var(--color-accent)', display: 'flex' }}><CornerDownRight size={13} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {mistake.questionId} · {mistake.category}{mistake.topic ? ` · ${mistake.topic}` : ''}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: '11.5px' }}
                  onClick={() => removeDraftMistake(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {formError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: 'var(--status-danger)', fontSize: '13px' }}>
              <AlertCircle size={16} /> {formError}
            </div>
          )}
        </div>

        <div className="dialog-foot">
          <span className="dim" style={{ fontSize: '11.5px', flex: 1 }}>
            {draftMistakes.length === 0
              ? 'Mistakes you log here are drilled before the next sitting.'
              : `${draftMistakes.length} mistake${draftMistakes.length === 1 ? '' : 's'} will be added to your notebook and drilled before the next sitting.`}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Discard</button>
          <button type="button" className="btn btn-primary" onClick={saveReview} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save review'}
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
