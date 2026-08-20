import { ArrowDownUp, Search, X } from 'lucide-react';

export default function PaperSearch({
  value,
  onChange,
  sortBy,
  onSortChange,
  sortOptions = [],
  disabled = false,
}) {
  const hasSearch = Boolean(value?.trim());

  return (
    <section className="paper-search" aria-label="Search papers">
      <div className="paper-search-header">
        <div>
          <div className="eyebrow">Paper search</div>
          <h3>Find a paper</h3>
          <p>Start typing to filter by subject, school, year, title, or paper type.</p>
        </div>
        <Search size={18} aria-hidden="true" />
      </div>

      <div className="paper-search-controls">
        <label className="paper-search-input" htmlFor="paper-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            id="paper-search-input"
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Search papers, subjects, schools, or years"
            disabled={disabled}
            autoComplete="off"
          />
          {hasSearch && (
            <button
              type="button"
              className="paper-search-clear"
              onClick={() => onChange('')}
              aria-label="Clear paper search"
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </label>

        <label className="paper-sort-control" htmlFor="paper-sort-select">
          <span className="paper-sort-label"><ArrowDownUp size={15} aria-hidden="true" /> Sort by</span>
          <select
            id="paper-sort-select"
            value={sortBy}
            onChange={(event) => onSortChange(event.target.value)}
            disabled={disabled}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
