import { DatabaseZap } from 'lucide-react';
import { useEscapeKey } from '../utils/useEscapeKey';
import { usePresence } from '../utils/usePresence';

/**
 * One-time notice about the data-service move. Shown before anything else, so
 * it uses the same ruled dialog as the rest of the portal.
 */
export default function FirebaseResetNotice({ isOpen, onDismiss }) {
  const presence = usePresence(isOpen, 220);
  useEscapeKey(isOpen, onDismiss);

  if (!presence.mounted) return null;

  return (
    <div className={`dialog-backdrop is-${presence.stage}`} role="presentation" style={{ zIndex: 10000 }}>
      <section
        className="dialog dialog--narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="firebase-reset-notice-title"
        aria-describedby="firebase-reset-notice-description"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span aria-hidden="true" style={{ color: 'var(--color-accent)', display: 'flex' }}>
            <DatabaseZap size={18} />
          </span>
          <span className="kick">A one-time notice</span>
        </div>

        <h3 id="firebase-reset-notice-title" style={{ margin: '6px 0 10px', fontSize: '25px' }}>
          Your setup needs a fresh start
        </h3>

        <p
          id="firebase-reset-notice-description"
          style={{ fontSize: '13.5px', textAlign: 'justify', color: 'color-mix(in srgb, var(--color-text) 78%, transparent)' }}
        >
          We have moved the portal to a dedicated, more reliable data service. Your previous synced setup could not be
          transferred, so please sign in again and choose your subjects and preferences.
        </p>
        <p style={{ fontSize: '13.5px', textAlign: 'justify', color: 'color-mix(in srgb, var(--color-text) 78%, transparent)' }}>
          Your paper library is unchanged. This message appears only once on this device.
        </p>

        <button type="button" className="btn btn-primary btn-block" onClick={onDismiss}>
          Continue to the portal
        </button>
      </section>
    </div>
  );
}
