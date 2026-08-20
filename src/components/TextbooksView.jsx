import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

/** The shared Drive folder the portal's textbooks live in. */
export const TEXTBOOKS_FOLDER_ID = '1vAADiVrKUIR_iApOoBdghSvKU6JhIwKT';
export const TEXTBOOKS_FOLDER_URL = `https://drive.google.com/drive/folders/${TEXTBOOKS_FOLDER_ID}`;
const TEXTBOOKS_EMBED_URL = `https://drive.google.com/embeddedfolderview?id=${TEXTBOOKS_FOLDER_ID}#grid`;

/**
 * Textbooks opens the shared Drive folder in place rather than listing cards
 * that each link out to the same folder. Drive's embedded folder view is used
 * for the grid; the button beside it opens the real thing in a new tab, for
 * anyone whose browser or account blocks the frame.
 */
export default function TextbooksView() {
  const [isLoading, setIsLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);

  return (
    <div className="textbooks-view">
      <div className="textbooks-head">
        <div>
          <div className="kick">Reference shelf</div>
          <h4 style={{ margin: '5px 0 0' }}>Textbooks and reference material</h4>
          <p className="dim" style={{ fontSize: '12.5px', margin: '4px 0 0' }}>
            The shared Drive folder, opened in place. Sign in to Google if a file asks for access.
          </p>
        </div>
        <a
          className="btn btn-secondary"
          href={TEXTBOOKS_FOLDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 'none' }}
        >
          Open in Drive
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="textbooks-frame">
        {isLoading && !isBlocked && (
          <div className="textbooks-state">
            <RefreshCw size={22} className="spin" />
            <p className="dim" style={{ fontSize: '13px', marginTop: '10px' }}>Opening the shelf…</p>
          </div>
        )}

        {isBlocked ? (
          <div className="textbooks-state">
            <h5 style={{ margin: 0 }}>Drive would not open in place</h5>
            <p className="dim" style={{ fontSize: '13px', maxWidth: '46ch', textAlign: 'center', margin: '8px 0 14px' }}>
              Your browser or Google account is blocking the embedded view. The folder itself is fine —
              open it in a new tab instead.
            </p>
            <a className="btn btn-primary" href={TEXTBOOKS_FOLDER_URL} target="_blank" rel="noopener noreferrer">
              Open in Drive
              <ExternalLink size={14} />
            </a>
          </div>
        ) : (
          <iframe
            title="HSC textbooks — shared Google Drive folder"
            src={TEXTBOOKS_EMBED_URL}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setIsBlocked(true); }}
          />
        )}
      </div>
    </div>
  );
}
