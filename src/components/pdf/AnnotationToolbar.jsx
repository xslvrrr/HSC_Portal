import {
  ArrowUpRight,
  Eraser,
  Hand,
  Highlighter,
  Maximize,
  Minus,
  MousePointer2,
  PanelBottomClose,
  Pencil,
  Redo2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Tooltip from './Tooltip';
import { ANNOTATION_COLORS, HIGHLIGHT_COLORS, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH } from '../../utils/annotations';

const TOOLS = [
  { id: 'select', title: 'Select', hint: 'V', Icon: MousePointer2 },
  { id: 'hand', title: 'Pan', hint: 'H', Icon: Hand },
  { id: 'draw', title: 'Free draw', hint: 'D', Icon: Pencil },
  { id: 'highlight', title: 'Highlight', hint: 'G', Icon: Highlighter },
  { id: 'line', title: 'Line', hint: 'L', Icon: Minus },
  { id: 'arrow', title: 'Arrow', hint: 'A', Icon: ArrowUpRight },
  { id: 'text', title: 'Note', hint: 'T', Icon: Type },
  { id: 'eraser', title: 'Erase', hint: 'E', Icon: Eraser },
];

const STROKE_STEPS = [1, 2, 4, 8];

/**
 * One button.
 *
 * Selecting a tool widens it to name itself — the armed tool should say what it
 * is — while the history and zoom buttons stay square. The label's width and
 * margin animate together rather than appearing instantly, which is what stops
 * the bar snapping between sizes.
 */
function ToolButton({ title, hint, Icon, active = false, disabled = false, expand = true, onClick }) {
  return (
    <Tooltip label={title} hint={hint}>
      {(tipId) => (
        <button
          type="button"
          className={`tool-btn ${active ? 'on' : ''}`}
          aria-label={title}
          aria-pressed={active}
          aria-describedby={tipId}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          <Icon size={16} />
          {expand && (
            <span className={`tool-btn-label ${active ? 'on' : ''}`} aria-hidden="true">
              <span>{title}</span>
            </span>
          )}
        </button>
      )}
    </Tooltip>
  );
}

function ToolGroup({ label, children }) {
  return (
    <div className="tool-group" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * The annotation toolbar.
 *
 * Reworked from the Millennium reader's floating toolbar: the same grouping —
 * history, tools, ink, zoom — the same widen-to-name behaviour, ruled and
 * squared to match the portal rather than a rounded glass pill.
 */
export default function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  palette = 'ink',
  strokeWidth,
  onStrokeWidthChange,
  scale,
  minScale = 0.35,
  maxScale = 6,
  isRasterStale = false,
  onZoom,
  onFitWidth,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHide,
}) {
  const inkVisible = tool !== 'select' && tool !== 'hand' && tool !== 'eraser';
  const swatches = palette === 'highlight' ? HIGHLIGHT_COLORS : ANNOTATION_COLORS;

  return (
    <div className="tool-row">
      <ToolGroup label="History">
        <ToolButton title="Undo" hint="⌘Z" Icon={Undo2} expand={false} disabled={!canUndo} onClick={onUndo} />
        <ToolButton title="Redo" hint="⇧⌘Z" Icon={Redo2} expand={false} disabled={!canRedo} onClick={onRedo} />
      </ToolGroup>

      <ToolGroup label="Annotation tools">
        {TOOLS.map(({ id, title, hint, Icon }) => (
          <ToolButton
            key={id}
            title={title}
            hint={hint}
            Icon={Icon}
            active={tool === id}
            onClick={() => onToolChange(id)}
          />
        ))}
      </ToolGroup>

      <div className={`tool-group tool-ink ${inkVisible ? 'on' : ''}`} role="toolbar" aria-label={palette === 'highlight' ? 'Highlighter' : 'Ink'} aria-hidden={!inkVisible}>
        <div className="tool-ink-inner">
          {swatches.map((entry) => (
            <Tooltip key={entry.id} label={entry.label}>
              {(tipId) => (
                <button
                  type="button"
                  className={`ink-swatch ${color === entry.value ? 'on' : ''}`}
                  style={{ background: entry.value }}
                  aria-label={entry.label}
                  aria-pressed={color === entry.value}
                  aria-describedby={tipId}
                  tabIndex={inkVisible ? 0 : -1}
                  onClick={() => onColorChange(entry.value)}
                />
              )}
            </Tooltip>
          ))}

          <span className="tool-divider" aria-hidden="true" />

          {STROKE_STEPS.map((width) => (
            <Tooltip key={width} label={`Weight ${width}`}>
              {(tipId) => (
                <button
                  type="button"
                  className={`stroke-step ${strokeWidth === width ? 'on' : ''}`}
                  aria-label={`Stroke weight ${width}`}
                  aria-pressed={strokeWidth === width}
                  aria-describedby={tipId}
                  tabIndex={inkVisible ? 0 : -1}
                  onClick={() => onStrokeWidthChange(Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, width)))}
                >
                  <span style={{ height: `${width}px` }} />
                </button>
              )}
            </Tooltip>
          ))}
        </div>
      </div>

      <ToolGroup label="Zoom">
        <ToolButton title="Zoom out" hint="⌘−" Icon={ZoomOut} expand={false} disabled={scale <= minScale} onClick={() => onZoom(-1)} />
        <ToolButton title="Zoom in" hint="⌘+" Icon={ZoomIn} expand={false} disabled={scale >= maxScale} onClick={() => onZoom(1)} />
        <Tooltip label="Fit the page width" hint="⌘0">
          {(tipId) => (
            <button
              type="button"
              className={`tool-btn tool-scale num ${isRasterStale ? 'is-stale' : ''}`}
              aria-label="Fit the page width"
              aria-describedby={tipId}
              onClick={onFitWidth}
            >
              <Maximize size={13} />
              {Math.round(scale * 100)}%
            </button>
          )}
        </Tooltip>
        {onHide && (
          <ToolButton title="Hide the tools" hint="⌘." Icon={PanelBottomClose} expand={false} onClick={onHide} />
        )}
      </ToolGroup>
    </div>
  );
}
