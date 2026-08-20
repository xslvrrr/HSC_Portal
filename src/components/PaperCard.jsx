import React from 'react';
import { Star, FileText, CheckCircle2, Share2 } from 'lucide-react';

export default function PaperCard({
  paper,
  subjectName,
  schoolName,
  isBookmarked,
  toggleBookmark,
  sharePaper,
  onSelectPaper
}) {
  const getCategoryDetails = (code) => {
    switch (code) {
      case 'H':
        return { label: 'Official HSC', color: 'var(--brand-experiment)', tint: 'rgba(53,91,79,0.08)' };
      case 'T':
        return { label: 'School trial', color: '#617d73', tint: 'rgba(97,125,115,0.12)' };
      case 'A':
        return { label: 'Assessment task', color: '#8c7560', tint: 'rgba(140,117,96,0.12)' };
      default:
        return { label: 'Other resource', color: 'var(--header-secondary)', tint: 'rgba(84,97,92,0.08)' };
    }
  };

  const category = getCategoryDetails(paper.c);

  return (
    <article className="paper-card" style={{ borderTop: `4px solid ${category.color}` }}>
      <div className="paper-card-main">
        <div className="paper-card-heading">
          <div className="paper-card-labels">
            <span
              className="pill paper-card-category"
              style={{ backgroundColor: category.tint, color: category.color, borderColor: 'transparent', padding: '6px 10px' }}
            >
              {category.label}
            </span>
            {paper.w === 1 && (
              <span
                className="pill paper-card-solution"
                style={{ backgroundColor: 'rgba(62,111,89,0.1)', color: 'var(--status-positive)', borderColor: 'rgba(62,111,89,0.14)' }}
                title="Solutions available"
              >
                <CheckCircle2 size={14} />
                <span>Solutions</span>
              </span>
            )}
          </div>

          <h3 className="paper-card-title" title={paper.n}>
            {paper.n}
          </h3>
        </div>

        <div className="paper-card-details">
          <div>
            <span className="paper-card-detail-label">Subject</span>
            <span className="paper-card-detail-value">{subjectName}</span>
          </div>
          <div>
            <span className="paper-card-detail-label">School</span>
            <span className="paper-card-detail-value" title={schoolName}>{schoolName}</span>
          </div>
          <div>
            <span className="paper-card-detail-label">Year</span>
            <span className="paper-card-detail-value">{paper.y} · Year {paper.l}</span>
          </div>
        </div>
      </div>

      <div className="paper-card-footer">
        <div className="paper-card-actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              sharePaper();
            }}
            className="btn-secondary"
            title="Share test link"
            aria-label="Share test link"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleBookmark();
            }}
            className="btn-secondary"
            style={{ color: isBookmarked ? 'var(--status-warning)' : 'var(--interactive-muted)' }}
            title={isBookmarked ? 'Remove bookmark' : 'Save paper'}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Save paper'}
          >
            <Star size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onSelectPaper(paper)}
          className="btn-primary paper-card-practice"
        >
          <FileText size={16} />
          <span>Practice</span>
        </button>
      </div>
    </article>
  );
}
