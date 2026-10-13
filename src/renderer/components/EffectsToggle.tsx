import { useState, useEffect } from 'react';

interface EffectsToggleProps {
  disabled: boolean;
  onChange: (config: EffectsConfig) => void;
}

export interface EffectsConfig {
  zoom: { enabled: boolean; zoomLevel: number };
  tilt: { enabled: boolean; intensity: 'subtle' | 'medium' | 'dramatic' };
  canvas: { enabled: boolean; background: string; padding: number; borderRadius: number; shadow: boolean };
  cursor: { enabled: boolean; dotSize: number; dotColor: string; clickRipple: boolean };
}

const BG_PRESETS = [
  { label: 'Dark Navy', value: '#1a1a2e' },
  { label: 'Deep Purple', value: '#2d1b69' },
  { label: 'Charcoal', value: '#2d2d2d' },
  { label: 'Ocean', value: '#0f3460' },
  { label: 'Forest', value: '#1b4332' },
];

export default function EffectsToggle({ disabled, onChange }: EffectsToggleProps) {
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.5);
  const [tiltEnabled, setTiltEnabled] = useState(true);
  const [tiltIntensity, setTiltIntensity] = useState<'subtle' | 'medium' | 'dramatic'>('subtle');
  const [canvasEnabled, setCanvasEnabled] = useState(true);
  const [canvasBg, setCanvasBg] = useState('#1a1a2e');
  const [canvasPadding, setCanvasPadding] = useState(48);
  const [canvasRadius, setCanvasRadius] = useState(12);
  const [canvasShadow, setCanvasShadow] = useState(true);
  const [cursorEnabled, setCursorEnabled] = useState(true);
  const [cursorSize, setCursorSize] = useState(10);
  const [cursorColor, setCursorColor] = useState('#ffcc00');
  const [cursorRipple, setCursorRipple] = useState(true);

  const emitChange = (updates: Partial<{
    ze: boolean; zl: number; te: boolean; ti: string;
    ce: boolean; cbg: string; cp: number; cr: number; cs: boolean;
    cue: boolean; cus: number; cuc: string; cur: boolean;
  }>) => {
    const ze = updates.ze ?? zoomEnabled;
    const zl = updates.zl ?? zoomLevel;
    const te = updates.te ?? tiltEnabled;
    const ti = (updates.ti ?? tiltIntensity) as 'subtle' | 'medium' | 'dramatic';
    const ce = updates.ce ?? canvasEnabled;
    const cbg = updates.cbg ?? canvasBg;
    const cp = updates.cp ?? canvasPadding;
    const cr = updates.cr ?? canvasRadius;
    const cs = updates.cs ?? canvasShadow;
    const cue = updates.cue ?? cursorEnabled;
    const cus = updates.cus ?? cursorSize;
    const cuc = updates.cuc ?? cursorColor;
    const cur = updates.cur ?? cursorRipple;

    onChange({
      zoom: { enabled: ze, zoomLevel: zl },
      tilt: { enabled: te, intensity: ti },
      canvas: { enabled: ce, background: cbg, padding: cp, borderRadius: cr, shadow: cs },
      cursor: { enabled: cue, dotSize: cus, dotColor: cuc, clickRipple: cur },
    });
  };

  // Saved settings live in the main process; the capture overlay can change them too
  const apply = (c: EffectsConfig) => {
    setZoomEnabled(c.zoom.enabled);
    setZoomLevel(c.zoom.zoomLevel);
    setTiltEnabled(c.tilt.enabled);
    setTiltIntensity(c.tilt.intensity);
    setCanvasEnabled(c.canvas.enabled);
    setCanvasBg(c.canvas.background);
    setCanvasPadding(c.canvas.padding);
    setCanvasRadius(c.canvas.borderRadius);
    setCanvasShadow(c.canvas.shadow);
    setCursorEnabled(c.cursor.enabled);
    setCursorSize(c.cursor.dotSize);
    setCursorColor(c.cursor.dotColor);
    setCursorRipple(c.cursor.clickRipple);
  };

  useEffect(() => {
    window.recorder.getEffects().then((c) => c && apply(c));
    window.recorder.onEffectsChanged(apply);
  }, []);

  return (
    <div className="effects-toggle">
      <h3>Effects</h3>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={zoomEnabled}
          disabled={disabled}
          onChange={(e) => {
            setZoomEnabled(e.target.checked);
            emitChange({ ze: e.target.checked });
          }}
        />
        <span>Auto-Zoom on Click</span>
      </label>

      {zoomEnabled && (
        <div className="sub-control">
          <label>
            Zoom: {zoomLevel.toFixed(1)}x
            <input
              type="range"
              min="1.2"
              max="3.0"
              step="0.1"
              value={zoomLevel}
              disabled={disabled}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setZoomLevel(val);
                emitChange({ zl: val });
              }}
            />
          </label>
        </div>
      )}

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={tiltEnabled}
          disabled={disabled}
          onChange={(e) => {
            setTiltEnabled(e.target.checked);
            emitChange({ te: e.target.checked });
          }}
        />
        <span>3D Tilt</span>
      </label>

      {tiltEnabled && (
        <div className="sub-control">
          <label>
            Intensity:
            <select
              value={tiltIntensity}
              disabled={disabled}
              onChange={(e) => {
                const val = e.target.value as 'subtle' | 'medium' | 'dramatic';
                setTiltIntensity(val);
                emitChange({ ti: val });
              }}
            >
              <option value="subtle">Subtle</option>
              <option value="medium">Medium</option>
              <option value="dramatic">Dramatic</option>
            </select>
          </label>
        </div>
      )}

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={canvasEnabled}
          disabled={disabled}
          onChange={(e) => {
            setCanvasEnabled(e.target.checked);
            emitChange({ ce: e.target.checked });
          }}
        />
        <span>Canvas Background</span>
      </label>

      {canvasEnabled && (
        <div className="sub-control">
          <label>
            Background:
            <select
              value={canvasBg}
              disabled={disabled}
              onChange={(e) => {
                setCanvasBg(e.target.value);
                emitChange({ cbg: e.target.value });
              }}
            >
              {BG_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>

          <label>
            Padding: {canvasPadding}px
            <input
              type="range"
              min="16"
              max="96"
              step="8"
              value={canvasPadding}
              disabled={disabled}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setCanvasPadding(val);
                emitChange({ cp: val });
              }}
            />
          </label>

          <label>
            Corners: {canvasRadius}px
            <input
              type="range"
              min="0"
              max="32"
              step="4"
              value={canvasRadius}
              disabled={disabled}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setCanvasRadius(val);
                emitChange({ cr: val });
              }}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={canvasShadow}
              disabled={disabled}
              onChange={(e) => {
                setCanvasShadow(e.target.checked);
                emitChange({ cs: e.target.checked });
              }}
            />
            <span>Drop Shadow</span>
          </label>
        </div>
      )}

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={cursorEnabled}
          disabled={disabled}
          onChange={(e) => {
            setCursorEnabled(e.target.checked);
            emitChange({ cue: e.target.checked });
          }}
        />
        <span>Cursor Highlight</span>
      </label>

      {cursorEnabled && (
        <div className="sub-control">
          <label>
            Size: {cursorSize}px
            <input
              type="range"
              min="5"
              max="20"
              step="1"
              value={cursorSize}
              disabled={disabled}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setCursorSize(val);
                emitChange({ cus: val });
              }}
            />
          </label>

          <label>
            Color:
            <input
              type="color"
              value={cursorColor}
              disabled={disabled}
              onChange={(e) => {
                setCursorColor(e.target.value);
                emitChange({ cuc: e.target.value });
              }}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={cursorRipple}
              disabled={disabled}
              onChange={(e) => {
                setCursorRipple(e.target.checked);
                emitChange({ cur: e.target.checked });
              }}
            />
            <span>Click Ripple</span>
          </label>
        </div>
      )}
    </div>
  );
}
