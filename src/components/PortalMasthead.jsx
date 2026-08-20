import { Palette, Search } from 'lucide-react';
import UserButton from './UserButton';

export const PORTAL_SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'library', label: 'Library' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'notebook', label: 'Notebook' },
  { id: 'history', label: 'History' },
  { id: 'textbooks', label: 'Textbooks' },
];

/**
 * The masthead and section rail. Every screen in the reworked portal opens
 * under the same two lines: the title of the publication, and the run of
 * sections beneath it.
 */
export default function PortalMasthead({
  section,
  onSectionChange,
  runhead,
  onOpenPalette,
  onOpenCustomise,
  showActions = true,
}) {
  return (
    <header>
      <div className="mast">
        <div>
          <div className="kick">New South Wales · Preliminary &amp; HSC</div>
          <button
            type="button"
            className="mastname"
            onClick={() => onSectionChange('today')}
          >
            The Paper Room
          </button>
        </div>

        <div style={{ textAlign: 'right' }}>
          {runhead && <div className="runhead">{runhead}</div>}
          {showActions && (
            <div className="mast-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '13px' }}
                onClick={onOpenPalette}
              >
                <Search size={14} />
                Search or ask
                <span className="kbd" style={{ opacity: 0.6 }}>⌘K</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={onOpenCustomise}
                title="Customisation"
                aria-label="Open customisation"
              >
                <Palette size={16} />
              </button>
              <UserButton />
            </div>
          )}
        </div>
      </div>

      <nav className="secrail" aria-label="Sections">
        {PORTAL_SECTIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={section === entry.id ? 'on' : ''}
            aria-current={section === entry.id ? 'page' : undefined}
            onClick={() => onSectionChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
