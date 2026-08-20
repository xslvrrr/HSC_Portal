# Classical — the portal's design system

Ported from the Claude Design project **HSC papers portal mockups**
(`HSC Portal Rework.dc.html`, design system `classical-42fe4803`).

Source of truth: [`src/styles/classical.css`](../src/styles/classical.css). It is
imported after `src/index.css` in `src/main.jsx`, so its tokens win over the
legacy green palette while the older screens keep their markup.

## Ground

| | Daylight (`:root`) | Lamplight (`[data-theme='dark']`) |
|---|---|---|
| `--color-bg` | `#f3f2f2` | `#171614` |
| `--color-surface` | `#eae9e9` | `#1f1d1b` |
| `--color-text` | `#201f1d` | `#ece8e1` |
| `--color-accent` | `#b68235` | `#c9993f` |

Type: Cormorant Garamond for headings and figures, Lora for body. Radii are
2 / 4 / 7 px — the system is ruled, not rounded. Colour appears as a stroke,
never as a fill.

## Attributes on `<html>`

| Attribute | Values | Effect |
|---|---|---|
| `data-theme` | `light` \| `dark` | Chooses the ground |
| `data-density` | `compact` \| `book` \| `airy` | Moves `--gutter`, `--row-pad`, `--band-pad`. Never the type sizes |
| `data-layout` | `standard` \| `focus` | Retained from the previous build |

The rule colour is applied as inline custom properties by `App.jsx` from
`getAccentVars()` in `src/utils/appearancePresets.js`. Each colour carries a
daylight and a lamplight cut so the stroke keeps its weight on both grounds.

## Component classes

`.btn` (`-primary`, `-secondary`, `-ghost`, `-icon`, `-block`), `.input`,
`.field`, `.radio`, `.seg` / `.seg-opt`, `.card`, `.tag`, `.hr`, `.dialog*`.

Portal classes: `.mast`, `.mastname`, `.runhead`, `.secrail`, `.kick`, `.num`,
`.rung`, `.idxrow`, `.facet`, `.quickstart`, `.cmdk*`, `.almanac*`, `.runin*`,
`.margin-*`.

## The practice ladder

`src/utils/practiceLadder.js` derives each subject's rung (1–5) from recent
sittings, and the rung sets the time allowance offered for the next paper:

| Rung | Allowance |
|---|---|
| 1 | Untimed |
| 2 | +20% |
| 3 | +10% |
| 4 | To time |
| 5 | −10% |

Beginning a sitting writes `hsc_timer_duration_secs`, which the practice room
reads when it mounts, so the allowance controls the clock on the page.

## Shell and scrolling

`.portal` is a fixed viewport (`100dvh`, `overflow: hidden`). The masthead and
section rail hold the top; every pane inside a view carries `.pane-scroll` and
scrolls on its own, so the rails run to the bottom of the screen and never move.
Below 1080px the spreads fold to one column and the whole spread becomes the
single scrolling pane — the masthead still holds the top.

## Motion

All animation lives in the Motion block of `classical.css`, behind
`@media (prefers-reduced-motion: no-preference)`, with a matching `reduce` block
that flattens every duration. Views rise on change, dialogs lift, the command
line and the agent drawer slide, and index rows, facets, rungs and the run-in
bars transition rather than snap.

On the dark ground every backdrop is true black at 82%, not tinted ink.

## Onboarding

`OnboardingWizard.jsx` — an eight-step questionnaire on first visit, keyed by
`hsc_onboarded_v1`. It collects year level, subjects, a starting confidence rung
per subject, how the first week should work, the theme, and an entirely optional
Google connection (the skip control carries the same weight as sign-in).

Confidence answers are stored under `hsc_confidence_seed` and used by
`buildLadder` as each subject's starting rung until real sittings exist.

## Generated text and the agent

The portal avoids OpenRouter wherever the answer is a lookup:

- `src/utils/copyPool.js` — every recurring sentence is drawn from a pool of
  hand-written variants, picked deterministically from a day seed. No network
  call, no key, no invented claims.
- `src/utils/localAgent.js` — an intent router that answers the common questions
  (what to sit, the ladder, weak topics, exam countdowns, bookmarks, stats,
  library searches) from browser state. The model is only called when nothing
  matches.
- `src/utils/agentHarness.js` — the tool set the model can reach was widened
  beyond search and bookmarks: `get_ladder`, `recommend_next_paper`,
  `get_weak_topics`, `list_upcoming_exams`, `log_mistake`, `begin_sitting`,
  `open_section`.

## The practice room

The paper is rendered by the portal with pdf.js rather than handed to the
browser's PDF plug-in, so it can carry an annotation layer, obey one zoom
control, and sit on the paper ground. Styles live in
[`src/styles/reader.css`](../src/styles/reader.css).

| Piece | File | Origin |
|---|---|---|
| Page renderer + annotation layer | `components/pdf/PdfDocument.jsx` | new |
| Annotation toolbar | `components/pdf/AnnotationToolbar.jsx` | reworked from Millennium `kokonutui/toolbar` |
| Exam timer | `components/pdf/ExamTimerBar.jsx` | reworked from Millennium `ExamTimerToolbar` |
| Timer state machine | `utils/examTimer.js` | ported from Millennium `lib/past-papers/timer.ts` |
| Annotation model | `utils/annotations.js` | ported from Millennium `lib/pdf/annotations.ts` |
| Undo/redo | `utils/useAnnotationHistory.js` | ported from Millennium `useAnnotationHistory.ts` |
| The margin (AI) | `components/pdf/PaperMargin.jsx` | new |

Zoom, text and gestures:

- `utils/usePdfZoom.js` (ported) splits `liveScale` from `rasterScale`. Layout
  follows the pointer immediately while pdf.js redraws only once the gesture
  settles; between the two the bitmap is stretched by CSS. Pages also defer
  their first raster until they are near the viewport. Together these are what
  make the zoom controls immediate on a 68-page paper instead of stalling.
- Ctrl/⌘ + wheel zooms about the pointer, two-finger pinch zooms on touch, and
  ⌘+ / ⌘− / ⌘0 work inside the reader. Tool letters: V H D G L A T E.
- pdf.js `TextLayer` renders a real selectable text layer, sized at the raster
  scale and stretched to the live scale. Selection is disabled while a drawing
  tool is armed. Whatever is selected can be sent straight to the margin.
- `utils/paperTiming.js` reads "Reading time – 5 minutes / Working time – 3
  hours" off the first page and the timer adopts both, stating what it read.

Notes on the port:

- The timer keeps Millennium's two shapes — a minute dial while idle, a
  collapsed clock while running — its absolute-deadline state (correct across a
  backgrounded tab), its reading-time phase, and its synthesised chimes at the
  invigilator call points. The framer-motion/shadcn presentation is replaced by
  Classical rules and CSS transitions.
- Annotation points are normalised to the page box (0–1), so a mark made at one
  zoom lands in the same place at another. Strokes use `non-scaling-stroke` with
  a pixel weight; notes render in their own HTML layer because the SVG viewBox
  is stretched non-uniformly and would distort glyphs.
- Ink and highlighter are separate pens with separate palettes and memories.
- Marks persist per paper under `hsc_annotations_<paper id>`.
- Papers without a `cf` path exist only behind the legacy THSC viewer page,
  which is HTML — those still open in a frame rather than being passed to pdf.js.

Animation is CSS plus `utils/usePresence.js`, which holds an overlay mounted for
the length of its exit and stamps `is-entering` / `is-entered` / `is-exiting`
onto it — CSS alone cannot animate an unmount. Every dialog, drawer, the command
line, the toolbar, the reveal button and the library quick-start use it. Section
changes inside the portal body animate in only, since two views cannot occupy
the same pane at once.

The margin — labelled **Ask AI** — replaces the generic agent panel inside the reader: one exchange at a
time, the answer set as justified prose, a ruled "Done for you" ledger of
actions actually taken, and suggested questions built from this paper and this
student's own record (weakest topic, rung, whether solutions exist).

## Screens

| Design option | Implementation |
|---|---|
| 1a Today | `src/components/TodayView.jsx` |
| 1b Library | `src/components/LibraryView.jsx` + `src/utils/libraryQuery.js` |
| 1c Command line | `src/components/CommandPalette.jsx` (⌘K) |
| 1d Calendar | `src/components/CalendarView.jsx` |
| 1e Agent margin | `src/components/AgentCommandCenter.jsx`, restyled in `classical.css` |
| 2a Post-sitting review | `src/components/PracticeReviewModal.jsx` |
| 2b Customisation | `src/components/CustomizationMenu.jsx` |
| 2c Sync and install | `src/components/SyncInstallDialogs.jsx` |
| Onboarding | `src/components/OnboardingWizard.jsx` |
| Textbooks | `src/components/TextbooksView.jsx` — the shared Drive folder, embedded in place |

## Superseded components

These are no longer imported. They are left in the tree until their remaining
behaviour has been confirmed as covered:

`Sidebar.jsx`, `Filters.jsx`, `PaperCard.jsx`, `PaperSearch.jsx`,
`AdaptiveRecommendations.jsx`, `ExamCountdown.jsx`, `CustomCalendar.jsx`, and
`src/utils/adaptiveRecommendations.js`.
