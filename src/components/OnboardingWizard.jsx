import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { MAX_RUNG, getAllowanceForRung, saveConfidenceSeeds } from '../utils/practiceLadder';
import { saveMySubjects } from '../utils/mySubjects';
import { MODE_OPTIONS } from '../utils/appearancePresets';
import { usePresence } from '../utils/usePresence';

export const ONBOARDING_STORAGE_KEY = 'hsc_onboarded_v1';

const CONFIDENCE_LABELS = {
  1: 'Starting from scratch',
  2: 'Shaky — I need the notes open',
  3: 'Middling — some topics land, some do not',
  4: 'Solid — I can sit one to time',
  5: 'Strong — I want the harder version',
};

export function hasCompletedOnboarding() {
  try {
    return Boolean(localStorage.getItem(ONBOARDING_STORAGE_KEY));
  } catch (error) {
    // Without storage the questionnaire simply asks again next visit.
    return false;
  }
}

function markOnboardingComplete() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, new Date().toISOString());
  } catch (error) {
    // Non-fatal: the answers below are saved separately.
  }
}

/**
 * Onboarding — a questionnaire rather than a wall of text.
 *
 * Everything it collects feeds something concrete: the subjects drive the
 * library and the exam countdown, the confidence answers seed each subject's
 * starting rung on the ladder, and the appearance answers set the ground.
 * The Google step is genuinely optional — the portal is fully usable unsigned,
 * and the skip control carries the same weight as the sign-in one.
 */
export default function OnboardingWizard({
  isOpen,
  portalSubjects = [],
  initialSubjects = [],
  appearance,
  onAppearanceChange,
  onSignIn,
  isSignedIn = false,
  onComplete,
  onDismiss,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [level, setLevel] = useState(12);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [confidence, setConfidence] = useState({});
  const [startStyle, setStartStyle] = useState('ladder');

  const steps = useMemo(() => ([
    'welcome',
    'level',
    'subjects',
    'confidence',
    'style',
    'appearance',
    'account',
    'done',
  ]), []);

  const step = steps[stepIndex];
  const chosenSubjects = subjects.filter((name) => portalSubjects.includes(name));
  const presence = usePresence(isOpen, 220);

  if (!presence.mounted) return null;

  const toggleSubject = (name) => {
    setSubjects((current) => (
      current.includes(name)
        ? current.filter((entry) => entry !== name)
        : [...current, name]
    ));
  };

  const canAdvance = step !== 'subjects' || chosenSubjects.length > 0;

  const finish = () => {
    const savedSubjects = saveMySubjects(chosenSubjects);

    // Only keep seeds for subjects that survived the save, so the ladder never
    // carries a rung for a subject the student is not studying.
    const seeds = {};
    savedSubjects.forEach((name) => {
      const reported = Number(confidence[name]);
      if (Number.isFinite(reported) && reported >= 1) seeds[name] = reported;
    });
    saveConfidenceSeeds(seeds);

    markOnboardingComplete();
    onComplete?.({ subjects: savedSubjects, level, confidence: seeds, startStyle });
  };

  const next = () => {
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  const back = () => setStepIndex((current) => Math.max(0, current - 1));

  const skipAll = () => {
    markOnboardingComplete();
    onDismiss?.();
  };

  return (
    <div className={`dialog-backdrop is-${presence.stage}`} role="presentation">
      <section
        className="dialog dialog--wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="dialog-head">
          <div>
            <div className="kick">Setting up · step {stepIndex + 1} of {steps.length}</div>
            <h3 id="onboarding-title">{
              step === 'welcome' ? 'Welcome to the Paper Room'
                : step === 'level' ? 'Which year are you sitting?'
                  : step === 'subjects' ? 'What do you study?'
                    : step === 'confidence' ? 'How does each one feel right now?'
                      : step === 'style' ? 'How should the portal start you off?'
                        : step === 'appearance' ? 'How should it look?'
                          : step === 'account' ? 'Carry this between devices?'
                            : 'You are set up'
            }</h3>
          </div>
          <button type="button" className="btn btn-icon btn-secondary" onClick={skipAll} aria-label="Skip setup">
            <X size={15} />
          </button>
        </div>

        <div className="wizard-progress" aria-hidden="true">
          {steps.map((entry, index) => (
            <i key={entry} className={index <= stepIndex ? 'on' : ''} />
          ))}
        </div>

        <div className="dialog-scroll wizard-step" key={step}>
          {step === 'welcome' && (
            <>
              <p className="wizard-lede">
                A few questions, then the portal can prescribe a paper each day rather than leaving you to
                pick one. Nothing here is permanent — every answer can be changed later in customisation.
              </p>
              <p className="wizard-lede">
                Answers stay on this device unless you choose to sign in at the end.
              </p>
            </>
          )}

          {step === 'level' && (
            <>
              <p className="wizard-lede">This sets which half of the index the library opens on.</p>
              <div className="seg">
                {[12, 11].map((value) => (
                  <label key={value} className="seg-opt">
                    <input
                      type="radio"
                      name="onboarding-level"
                      checked={level === value}
                      onChange={() => setLevel(value)}
                    />
                    <span>Year {value}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 'subjects' && (
            <>
              <p className="wizard-lede">
                Pin the subjects you are sitting so Today shows <em>your</em> next exam, not everyone&apos;s
                English Paper 1. Pick at least one.
              </p>
              <div className="wizard-chips">
                {portalSubjects.map((name) => {
                  const selected = subjects.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`chip-choice ${selected ? 'on' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleSubject(name)}
                    >
                      {selected && <Check size={12} />}
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="sec-note" style={{ marginTop: '12px' }}>
                {chosenSubjects.length} selected
              </p>
            </>
          )}

          {step === 'confidence' && (
            <>
              <p className="wizard-lede">
                This sets your starting rung. Rung 1 opens papers untimed and open book; rung 5 offers them
                ten per cent under exam time. Your marks take over from here as soon as you sit one.
              </p>
              {chosenSubjects.length === 0 ? (
                <p className="dim">No subjects chosen — go back a step to pick some.</p>
              ) : chosenSubjects.map((name) => {
                const value = confidence[name] || 1;
                return (
                  <div key={name} className="wizard-row">
                    <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '16px' }}>{name}</div>
                      <div className="dim" style={{ fontSize: '11.5px' }}>
                        {CONFIDENCE_LABELS[value]} · offers {getAllowanceForRung(value).label.toLowerCase()}
                      </div>
                    </div>
                    <div className="seg">
                      {Array.from({ length: MAX_RUNG }, (_, index) => index + 1).map((rung) => (
                        <label key={rung} className="seg-opt">
                          <input
                            type="radio"
                            name={`onboarding-confidence-${name}`}
                            checked={value === rung}
                            onChange={() => setConfidence((current) => ({ ...current, [name]: rung }))}
                          />
                          <span>{rung}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {step === 'style' && (
            <>
              <p className="wizard-lede">
                Both settings can change at any time; this only decides what the first week looks like.
              </p>
              {[
                { id: 'ladder', title: 'Let the ladder decide', note: 'A paper is prescribed each day, at the allowance your confidence earns.' },
                { id: 'browse', title: 'I will pick my own', note: 'Today opens on the index instead, and the ladder just keeps score.' },
              ].map((option) => (
                <label key={option.id} className="wizard-option">
                  <input
                    type="radio"
                    name="onboarding-style"
                    checked={startStyle === option.id}
                    onChange={() => setStartStyle(option.id)}
                  />
                  <span className="dot" />
                  <span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', display: 'block' }}>{option.title}</span>
                    <span className="dim" style={{ fontSize: '12px' }}>{option.note}</span>
                  </span>
                </label>
              ))}
            </>
          )}

          {step === 'appearance' && (
            <>
              <p className="wizard-lede">The portal is set in ink on paper. Choose the ground.</p>
              <div className="wizard-modes">
                {MODE_OPTIONS.map((option) => (
                  <label key={option.value} className="seg-opt wizard-mode">
                    <input
                      type="radio"
                      name="onboarding-mode"
                      checked={appearance?.mode === option.value}
                      onChange={() => onAppearanceChange?.({ mode: option.value })}
                    />
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '15px' }}>{option.label}</span>
                    <span className="dim" style={{ fontSize: '11px' }}>{option.description}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 'account' && (
            <>
              <p className="wizard-lede">
                Signing in with Google carries your saved papers, sittings, confidence rungs and notebook
                between the library computer and your own. It is entirely optional: everything works
                unsigned, it simply stays on this machine.
              </p>
              {isSignedIn ? (
                <p style={{ color: 'var(--color-accent-700)' }}>Signed in — your work will sync.</p>
              ) : (
                <div className="wizard-actions-inline">
                  <button type="button" className="btn btn-primary" onClick={onSignIn}>
                    Connect a Google account
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={next}>
                    Continue without one
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'done' && (
            <>
              <p className="wizard-lede">
                {chosenSubjects.length} subject{chosenSubjects.length === 1 ? '' : 's'} pinned, Year {level}.
                Today will open on {startStyle === 'ladder' ? 'the prescribed sitting' : 'the library index'}.
              </p>
              <div className="wizard-summary">
                {chosenSubjects.map((name) => (
                  <div key={name} className="aside-row" style={{ padding: '8px 0' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '15px' }}>{name}</span>
                    <span className="num dim" style={{ fontSize: '12.5px' }}>
                      rung {confidence[name] || 1} · {getAllowanceForRung(confidence[name] || 1).label}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="dialog-foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={back}
            disabled={stepIndex === 0}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={skipAll}>Skip setup</button>
          <button type="button" className="btn btn-primary" onClick={next} disabled={!canAdvance}>
            {stepIndex === steps.length - 1 ? 'Open the portal' : 'Continue'}
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
