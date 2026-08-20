import { ArrowRight, CheckCircle2, Sparkles, Star } from 'lucide-react';

const PAPER_TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'T', label: 'Trials' },
  { value: 'H', label: 'Official' },
  { value: 'A', label: 'Tasks' },
];

function categoryLabel(code) {
  if (code === 'H') return 'Official HSC';
  if (code === 'T') return 'School trial';
  if (code === 'A') return 'Assessment task';
  return 'Resource';
}

export default function AdaptiveRecommendations({
  recommendations = [],
  subjects = [],
  schools = [],
  bookmarks = new Set(),
  paperType = 'all',
  subjectScopeLabel = '',
  hasSubjectScope = false,
  onPaperTypeChange,
  onToggleBookmark,
  onOpenPaper,
}) {
  const selectedTypeLabel = PAPER_TYPE_FILTERS.find((filter) => filter.value === paperType)?.label.toLowerCase() || 'papers';

  return (
    <section className="adaptive-recommendations" aria-labelledby="adaptive-recommendations-title">
      <div className="adaptive-recommendations-heading">
        <div>
          <div className="eyebrow adaptive-recommendations-eyebrow">
            <Sparkles size={13} aria-hidden="true" />
            Suggested next
          </div>
          <h2 id="adaptive-recommendations-title">A focused practice pick</h2>
          <p>{hasSubjectScope ? `From ${subjectScopeLabel}. Choose a paper type to narrow the next step.` : 'Choose a subject or save your subjects to receive focused recommendations.'}</p>
        </div>

        <div className="adaptive-recommendation-filters" role="group" aria-label="Recommendation paper type">
          {PAPER_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`adaptive-recommendation-filter ${paperType === filter.value ? 'is-active' : ''}`}
              onClick={() => onPaperTypeChange?.(filter.value)}
              aria-pressed={paperType === filter.value}
              disabled={!hasSubjectScope}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {!hasSubjectScope ? (
        <div className="adaptive-recommendations-empty">
          Select a subject from the left sidebar, or use <strong>Save my subjects</strong>, and your recommendations will stay within those subjects.
        </div>
      ) : recommendations.length === 0 ? (
        <div className="adaptive-recommendations-empty">
          No {selectedTypeLabel} are available for {subjectScopeLabel} yet. Try another paper type.
        </div>
      ) : (
        <div className="adaptive-recommendations-grid">
          {recommendations.map(({ paper, reason }) => {
            const isBookmarked = bookmarks.has(`${paper.v}_${paper.n}`);
            const subjectName = subjects[paper.s] || 'HSC subject';
            const schoolName = schools[paper.h] || 'Independent';

            return (
              <article className="adaptive-recommendation-card" key={`${paper.v}-${paper.s}-${paper.l}-${paper.c}-${paper.y}-${paper.h}-${paper.n}`}>
                <div className="adaptive-recommendation-card-topline">
                  <span className="adaptive-recommendation-category">{categoryLabel(paper.c)}</span>
                  {paper.w === 1 && (
                    <span className="adaptive-recommendation-solutions">
                      <CheckCircle2 size={13} aria-hidden="true" />
                      Solutions
                    </span>
                  )}
                </div>

                <h3 title={paper.n}>{paper.n}</h3>
                <div className="adaptive-recommendation-meta">{subjectName} · {schoolName} · {paper.y}</div>
                <p className="adaptive-recommendation-reason">{reason}</p>

                <div className="adaptive-recommendation-actions">
                  <button
                    type="button"
                    className="adaptive-recommendation-save"
                    onClick={() => onToggleBookmark?.(paper)}
                    aria-label={isBookmarked ? `Remove ${paper.n} from saved papers` : `Save ${paper.n} for later`}
                    title={isBookmarked ? 'Remove from saved papers' : 'Save for later'}
                  >
                    <Star size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" className="adaptive-recommendation-open" onClick={() => onOpenPaper?.(paper)}>
                    Practice
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
