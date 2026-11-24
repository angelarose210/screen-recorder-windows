import { useCallback, useEffect, useRef, useState } from 'react';

type ClipInfo = { filePath: string; fileName: string; src: string; canReplace: boolean };

declare global {
  interface Window {
    trimmer: {
      getInfo: () => Promise<ClipInfo | null>;
      exportClip: (opts: { start: number; end: number; replace: boolean }) => Promise<{ outputPath: string }>;
      showInFolder: (filePath: string) => Promise<void>;
      onProgress: (cb: (fraction: number) => void) => void;
    };
  }
}

const MIN_LENGTH = 0.1;
const FRAME = 1 / 30;

type DragMode = 'start' | 'end' | 'playhead';

function fmt(t: number): string {
  const tenths = Math.floor(t * 10 + 1e-6);
  const s = Math.floor(tenths / 10);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  const tail = `${ss}.${tenths % 10}`;
  return h > 0 ? `${h}:${String(m % 60).padStart(2, '0')}:${tail}` : `${m}:${tail}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Resolves on the event, rejects if the video errors first
function waitFor(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('video error')); };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(event, ok);
    el.addEventListener('error', bad);
  });
}

function unload(v: HTMLVideoElement | null) {
  if (!v) return;
  v.pause();
  v.removeAttribute('src');
  v.load();
}

export default function TrimEditor() {
  const [info, setInfo] = useState<ClipInfo | null>(null);
  const [version, setVersion] = useState(0);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const stripGen = useRef(0);
  // Latest values for event handlers registered once
  const live = useRef({ start, end, duration });
  live.current = { start, end, duration };

  const src = info ? `${info.src}?v=${version}` : '';
  const saving = progress !== null;
  const untouched = duration > 0 && start < 0.05 && end > duration - 0.05;

  useEffect(() => {
    window.trimmer.getInfo().then((i) => {
      if (!i) return setError('No video to trim.');
      setInfo(i);
      document.title = `Trim - ${i.fileName}`;
    });
    window.trimmer.onProgress((f) => setProgress(f));
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrent(t);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !live.current.duration) return;
    if (!v.paused) return v.pause();
    const { start, end } = live.current;
    if (v.currentTime < start - 0.01 || v.currentTime >= end - 0.05) v.currentTime = start;
    v.play();
  }, []);

  // Smooth playhead while playing; stop at the out point
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.currentTime >= live.current.end) {
        v.pause();
        v.currentTime = live.current.end;
        setCurrent(live.current.end);
        return;
      }
      setCurrent(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Thumbnail strip behind the timeline, redrawn when the window is resized
  useEffect(() => {
    const track = trackRef.current;
    const canvas = stripRef.current;
    if (!src || !duration || !track || !canvas) return;
    let timer = 0;

    const draw = async (gen: number) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(track.clientWidth * dpr);
      canvas.height = Math.round(track.clientHeight * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const v = document.createElement('video');
      thumbVideoRef.current = v;
      v.muted = true;
      v.preload = 'auto';
      v.src = src;
      try {
        await waitFor(v, 'loadeddata');
        const cellW = canvas.height * (v.videoWidth / v.videoHeight || 16 / 9);
        const count = Math.max(1, Math.ceil(canvas.width / cellW));
        for (let i = 0; i < count && gen === stripGen.current; i++) {
          v.currentTime = clamp((((i + 0.5) * cellW) / canvas.width) * duration, 0, duration - 0.05);
          await waitFor(v, 'seeked');
          if (gen !== stripGen.current) break;
          ctx.drawImage(v, i * cellW, 0, cellW, canvas.height);
        }
      } catch {
        // Strip is decoration; the editor still works without it
      } finally {
        unload(v);
        if (thumbVideoRef.current === v) thumbVideoRef.current = null;
      }
    };

    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => draw(++stripGen.current), 150);
    });
    ro.observe(track);
    return () => {
      stripGen.current++;
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [src, duration]);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * live.current.duration, 0, live.current.duration);
  };

  const applyDrag = (mode: DragMode, t: number) => {
    const { start, end, duration } = live.current;
    if (mode === 'start') {
      const s = clamp(t, 0, end - MIN_LENGTH);
      setStart(s);
      seek(s);
    } else if (mode === 'end') {
      const e = clamp(t, start + MIN_LENGTH, duration);
      setEnd(e);
      seek(e);
    } else {
      seek(t);
    }
  };

  const beginDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    if (!live.current.duration || saving) return;
    e.preventDefault();
    e.stopPropagation();
    videoRef.current?.pause();
    applyDrag(mode, timeAt(e.clientX));
    const move = (ev: PointerEvent) => applyDrag(mode, timeAt(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const setInPoint = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setStart(clamp(t, 0, live.current.end - MIN_LENGTH));
  }, []);

  const setOutPoint = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setEnd(clamp(t, live.current.start + MIN_LENGTH, live.current.duration));
  }, []);

  const save = useCallback(async () => {
    if (!info || saving || untouched) return;
    setError(null);
    setSaved(null);
    setProgress(0);
    const doReplace = replace && info.canReplace;
    if (doReplace) {
      // Let go of the file so it can be moved to the Recycle Bin
      stripGen.current++;
      unload(thumbVideoRef.current);
      unload(videoRef.current);
    }
    try {
      const { outputPath } = await window.trimmer.exportClip({ start, end, replace: doReplace });
      setSaved(outputPath);
    } catch (err: any) {
      setError(`Couldn't save: ${String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`);
    } finally {
      setProgress(null);
      // Reload: the trimmed file after a replace, or the untouched original after a failure
      if (doReplace) setVersion((n) => n + 1);
    }
  }, [info, saving, untouched, replace, start, end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === ' ') {
        // Stop a focused button/checkbox from also being clicked
        e.preventDefault();
        target.blur?.();
        togglePlay();
      } else if (e.key === 'i' || e.key === 'I') {
        setInPoint();
      } else if (e.key === 'o' || e.key === 'O') {
        setOutPoint();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        v.pause();
        const step = (e.shiftKey ? 1 : FRAME) * (e.key === 'ArrowLeft' ? -1 : 1);
        seek(clamp(v.currentTime + step, 0, live.current.duration));
      } else if (e.key === 'Home') {
        seek(live.current.start);
      } else if (e.key === 'End') {
        seek(live.current.end);
      } else if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, setInPoint, setOutPoint, seek, save]);

  const onLoadedMetadata = () => {
    const v = videoRef.current!;
    if (!Number.isFinite(v.duration) || v.duration <= 0) {
      setError("Can't read this video's length.");
      return;
    }
    setDuration(v.duration);
    setStart(0);
    setEnd(v.duration);
    setCurrent(0);
  };

  const pct = (t: number) => (duration ? `${(t / duration) * 100}%` : '0%');

  return (
    <div className="trim">
      <div className="trim-stage" onClick={togglePlay}>
        {src && (
          <video
            ref={videoRef}
            src={src}
            preload="auto"
            onLoadedMetadata={onLoadedMetadata}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSeeked={(e) => setCurrent(e.currentTarget.currentTime)}
            onError={() => setError("Can't play this file. Trimming works with MP4 recordings.")}
          />
        )}
      </div>

      <div className="trim-panel">
        <div className="trim-row">
          <button className="trim-play" onClick={togglePlay} disabled={!duration} title="Play / pause (Space)">
            {playing ? (
              <svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5z" /></svg>
            )}
          </button>
          <span className="trim-time">
            {fmt(current)} <span className="trim-dim">/ {fmt(duration)}</span>
          </span>
          <span className="trim-keep">
            Keeping <strong>{fmt(Math.max(0, end - start))}</strong>
            <span className="trim-dim"> ({fmt(start)} to {fmt(end)})</span>
          </span>
        </div>

        <div className="tl-wrap">
          <div className="tl" ref={trackRef} onPointerDown={beginDrag('playhead')}>
            <canvas className="tl-strip" ref={stripRef} />
            <div className="tl-shade" style={{ left: 0, width: pct(start) }} />
            <div className="tl-shade" style={{ left: pct(end), right: 0 }} />
            <div className="tl-sel" style={{ left: pct(start), width: pct(end - start) }} />
            <div className="tl-handle tl-handle-start" style={{ left: pct(start) }} onPointerDown={beginDrag('start')} title="Drag to set the start (I)" />
            <div className="tl-handle tl-handle-end" style={{ left: pct(end) }} onPointerDown={beginDrag('end')} title="Drag to set the end (O)" />
            <div className="tl-playhead" style={{ left: pct(current) }} />
          </div>
        </div>

        <div className="trim-row">
          <button className="trim-btn" onClick={setInPoint} disabled={!duration || saving} title="Start the clip at the playhead (I)">
            Set start here
          </button>
          <button className="trim-btn" onClick={setOutPoint} disabled={!duration || saving} title="End the clip at the playhead (O)">
            Set end here
          </button>
          <span className="trim-spacer" />
          {info?.canReplace && (
            <label className="trim-check" title="The old file goes to the Recycle Bin">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={saving} />
              Replace original
            </label>
          )}
          <button className="trim-save" onClick={save} disabled={!duration || saving || untouched} title="Save (Ctrl+S)">
            {saving ? `Saving ${Math.round((progress ?? 0) * 100)}%` : replace && info?.canReplace ? 'Save and replace' : 'Save copy'}
          </button>
        </div>

        <div className="trim-status">
          {error ? (
            <span className="trim-error">{error}</span>
          ) : saved ? (
            <>
              <span className="trim-ok" title={saved}>
                Saved <strong>{saved.split(/[\\/]/).pop()}</strong> to {saved.replace(/[\\/][^\\/]*$/, '')}
              </span>
              <button className="trim-link-btn" onClick={() => window.trimmer.showInFolder(saved)}>Show in folder</button>
            </>
          ) : untouched ? (
            <span className="trim-dim">Drag the handles at either end of the timeline to cut the start or end. Space plays, I and O set start and end.</span>
          ) : (
            <span className="trim-dim">{replace && info?.canReplace ? 'Overwrites the original. The old file goes to the Recycle Bin.' : `Saves a new file next to ${info?.fileName ?? 'the original'}.`}</span>
          )}
        </div>
      </div>
    </div>
  );
}
