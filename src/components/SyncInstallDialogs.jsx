import { Plus, Share2, X } from 'lucide-react';
import { useEscapeKey } from '../utils/useEscapeKey';
import { usePresence } from '../utils/usePresence';

/**
 * Sync and install — the two small dialogs.
 *
 * Both are deliberately plain: a single ruled card, one paragraph of reasoning,
 * and two buttons. Neither blocks the portal; everything works unsigned.
 */

export function SignInDialog({ isOpen, onSignIn, onDismiss }) {
  const presence = usePresence(isOpen, 220);
  useEscapeKey(isOpen, onDismiss);

  if (!presence.mounted) return null;

  return (
    <div className={`dialog-backdrop is-${presence.stage}`} role="presentation" onMouseDown={onDismiss}>
      <section
        className="dialog dialog--narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kick">Across your devices</div>
        <h3 id="sync-title" style={{ margin: '6px 0 8px', fontSize: '25px' }}>Keep the ladder wherever you study</h3>
        <p style={{ fontSize: '13.5px', textAlign: 'justify', color: 'color-mix(in srgb, var(--color-text) 78%, transparent)', marginBottom: '18px' }}>
          Signing in carries your saved papers, sittings, confidence rungs and notebook between the library computer
          and your own. Everything works unsigned — it simply stays on this machine.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onSignIn}>
            Sign in with Google
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDismiss}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}

export function InstallDialog({ isOpen, onClose }) {
  const presence = usePresence(isOpen, 220);
  useEscapeKey(isOpen, onClose);

  if (!presence.mounted) return null;

  return (
    <div className={`dialog-backdrop is-${presence.stage}`} role="presentation" onMouseDown={onClose}>
      <section
        className="dialog dialog--narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <div className="kick">Off the browser</div>
            <h4 id="install-title" style={{ margin: '6px 0 0', fontSize: '21px' }}>Install to the home screen</h4>
          </div>
          <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <hr className="hr" style={{ margin: 'var(--space-3) 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '22px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'var(--font-heading)', fontSize: '15px', marginBottom: '7px' }}>
              <span style={{ color: 'var(--color-accent)', display: 'flex' }}><Share2 size={15} /></span>
              iPhone &amp; iPad — Safari
            </div>
            <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12.5px', lineHeight: 1.7, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>
              <li>Open the portal in Safari.</li>
              <li>Tap Share at the bottom.</li>
              <li>Choose Add to Home Screen.</li>
              <li>Tap Add.</li>
            </ol>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'var(--font-heading)', fontSize: '15px', marginBottom: '7px' }}>
              <span style={{ color: 'var(--color-accent)', display: 'flex' }}><Plus size={15} /></span>
              Android — Chrome
            </div>
            <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12.5px', lineHeight: 1.7, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>
              <li>Open the portal in Chrome.</li>
              <li>Tap the three-dot menu.</li>
              <li>Choose Install app.</li>
              <li>Confirm the prompt.</li>
            </ol>
          </div>
        </div>

        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: '18px' }} onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  );
}
