import { useState } from 'react';
import { Eye, EyeOff, Trash2, X } from 'lucide-react';
import { useEscapeKey } from '../utils/useEscapeKey';
import { usePresence } from '../utils/usePresence';
import {
  ACCENT_OPTIONS,
  APPEARANCE_DEFAULTS,
  DENSITY_OPTIONS,
  LAYOUT_OPTIONS,
  MODE_OPTIONS,
} from '../utils/appearancePresets';

/**
 * Customisation — themes, presets, and the AI key.
 *
 * One dialog, ruled into sections. Nothing here changes the type sizes; the
 * ground, the rule colour and the row density are the only levers.
 */
export default function CustomizationMenu({
  isOpen,
  settings,
  onChange,
  aiSettings = { providerMode: 'portal', personalKey: '' },
  onAiSettingsChange,
  onClose,
}) {
  const [showPersonalKey, setShowPersonalKey] = useState(false);
  const presence = usePresence(isOpen, 220);

  useEscapeKey(isOpen, onClose);

  if (!presence.mounted) return null;

  const usesPersonalKey = aiSettings.providerMode === 'personal';

  return (
    <div className={`dialog-backdrop is-${presence.stage}`} role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customisation-title"
        style={{ width: 'min(700px, 100%)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <div className="kick">Preferences</div>
            <h3 id="customisation-title">Customisation</h3>
            <p>Themes, colours, and a few extra layout choices</p>
          </div>
          <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Close customisation">
            <X size={15} />
          </button>
        </div>

        <div className="dialog-scroll">
          <div className="dialog-row">
            <div className="kick" style={{ marginBottom: '9px' }}>Theme mode</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="seg-opt"
                  style={{
                    border: '1px solid var(--color-divider)',
                    borderRadius: 'var(--radius-md)',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '3px',
                    padding: '10px 12px',
                  }}
                >
                  <input
                    type="radio"
                    name="customisation-mode"
                    checked={settings.mode === option.value}
                    onChange={() => onChange({ mode: option.value })}
                  />
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '15px' }}>{option.label}</span>
                  <span className="dim" style={{ fontSize: '11px' }}>{option.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="dialog-row" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '16px' }}>Show the prescribed sitting on Today</div>
              <div className="dim" style={{ fontSize: '12px' }}>Turn off to open straight into the library index.</div>
            </div>
            <div className="seg">
              {[true, false].map((value) => (
                <label key={String(value)} className="seg-opt">
                  <input
                    type="radio"
                    name="customisation-prescription"
                    checked={(settings.showRecommendations !== false) === value}
                    onChange={() => onChange({ showRecommendations: value })}
                  />
                  <span>{value ? 'On' : 'Off'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="dialog-row">
            <div className="kick" style={{ marginBottom: '9px' }}>Density</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="seg">
                {DENSITY_OPTIONS.map((option) => (
                  <label key={option.value} className="seg-opt" title={option.description}>
                    <input
                      type="radio"
                      name="customisation-density"
                      checked={settings.density === option.value}
                      onChange={() => onChange({ density: option.value })}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <span className="dim" style={{ fontSize: '11.5px' }}>
                Affects the index rows and margins, never the type sizes.
              </span>
            </div>
          </div>

          <div className="dialog-row">
            <div className="kick" style={{ marginBottom: '9px' }}>Rule colour</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {Object.entries(ACCENT_OPTIONS).map(([key, option]) => {
                const isActive = settings.accent === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onChange({ accent: key })}
                    title={`${option.label} — ${option.description}`}
                    aria-label={option.label}
                    aria-pressed={isActive}
                    style={{
                      width: '28px',
                      height: '28px',
                      padding: 0,
                      cursor: 'pointer',
                      background: option.accent,
                      border: `1px solid ${isActive ? 'var(--color-text)' : 'var(--color-divider)'}`,
                      outline: isActive ? '2px solid var(--color-accent)' : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                );
              })}
              <span className="dim" style={{ fontSize: '11.5px', marginLeft: '4px' }}>
                {ACCENT_OPTIONS[settings.accent]?.label || 'Gold'}, as stroke only
              </span>
            </div>
          </div>

          <div className="dialog-row">
            <div className="kick" style={{ marginBottom: '9px' }}>Page layout</div>
            <div className="seg">
              {LAYOUT_OPTIONS.map((option) => (
                <label key={option.value} className="seg-opt" title={option.description}>
                  <input
                    type="radio"
                    name="customisation-layout"
                    checked={settings.layout === option.value}
                    onChange={() => onChange({ layout: option.value })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="dialog-row">
            <div className="kick" style={{ marginBottom: '9px' }}>AI provider</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <label className="radio">
                <input
                  type="radio"
                  name="customisation-ai"
                  checked={!usesPersonalKey}
                  onChange={() => onAiSettingsChange?.({ providerMode: 'portal' })}
                />
                <span className="dot" />
                <span>Portal key — uses the key configured by the portal</span>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="customisation-ai"
                  checked={usesPersonalKey}
                  onChange={() => onAiSettingsChange?.({ providerMode: 'personal' })}
                />
                <span className="dot" />
                <span>Personal key — kept in this browser only</span>
              </label>
            </div>

            {usesPersonalKey && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginTop: '11px' }}>
                  <input
                    className="input"
                    type={showPersonalKey ? 'text' : 'password'}
                    value={aiSettings.personalKey || ''}
                    onChange={(event) => onAiSettingsChange?.({ personalKey: event.target.value })}
                    placeholder="sk-or-v1-…"
                    autoComplete="off"
                    spellCheck="false"
                    aria-label="OpenRouter API key"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => setShowPersonalKey((visible) => !visible)}
                    aria-label={showPersonalKey ? 'Hide the key' : 'Show the key'}
                  >
                    {showPersonalKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => onAiSettingsChange?.({ personalKey: '', providerMode: 'portal' })}
                    disabled={!aiSettings.personalKey}
                    aria-label="Remove the key"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="dim" style={{ fontSize: '11.5px', marginTop: '9px', marginBottom: 0 }}>
                  The key stays in this browser tab’s session storage. It is never synced, never saved to your
                  profile, and is discarded after each request.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="dialog-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onChange({ ...APPEARANCE_DEFAULTS })}>
            Reset to defaults
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
