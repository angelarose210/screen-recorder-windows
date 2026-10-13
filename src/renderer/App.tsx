import { useState, useEffect, useCallback, useRef } from 'react';
import RecordButton from './components/RecordButton';
import AreaSelector from './components/AreaSelector';
import AudioToggles from './components/AudioToggles';
import EffectsToggle, { EffectsConfig } from './components/EffectsToggle';
import StatusBar from './components/StatusBar';
import SaveFolders from './components/SaveFolders';

declare global {
  interface Window {
    recorder: {
      getSources: () => Promise<any[]>;
      start: (config: any) => Promise<void>;
      startArea: (config: any) => Promise<boolean>;
      stop: () => Promise<{ outputPath: string; cursorLogPath: string; effectsApplied: boolean }>;
      getState: () => Promise<string>;
      setEffects: (config: any) => Promise<void>;
      getEffects: () => Promise<any>;
      onEffectsChanged: (cb: (config: any) => void) => void;
      onStateChange: (cb: (state: string) => void) => void;
      onTimer: (cb: (seconds: number) => void) => void;
      onGlobalShortcut: (cb: (action: string) => void) => void;
      onFinished: (cb: (result: { outputPath: string; cursorLogPath: string; effectsApplied: boolean }) => void) => void;
      openOutputFolder: () => Promise<void>;
      getSettings: () => Promise<any>;
      setSettings: (settings: any) => Promise<void>;
      selectOutputFolder: (kind?: 'videos' | 'screenshots') => Promise<string | null>;
      getFolders: () => Promise<{ videos: string; screenshots: string }>;
      openFolder: (kind: 'videos' | 'screenshots') => Promise<void>;
    };
  }
}

export default function App() {
  const [state, setState] = useState<string>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [audioMic, setAudioMic] = useState(true);
  const [audioSystem, setAudioSystem] = useState(true);
  const [lastOutput, setLastOutput] = useState<string | null>(null);
  const [effectsApplied, setEffectsApplied] = useState(false);

  useEffect(() => {
    window.recorder.getSources().then((s) => {
      setSources(s);
      if (s.length > 0) setSelectedSource(s[0].id);
    });

    window.recorder.onStateChange((newState) => setState(newState));
    window.recorder.onTimer((seconds) => setElapsed(seconds));
    window.recorder.onFinished((result) => {
      setLastOutput(result.outputPath);
      setEffectsApplied(result.effectsApplied);
    });
    // Ref so the hotkey always uses the current source/audio picks, not the first render's
    window.recorder.onGlobalShortcut((action) => {
      if (action === 'toggle-recording') toggleRef.current();
      if (action === 'record-area') areaRef.current();
    });
  }, []);

  const handleToggleRecording = useCallback(async () => {
    const currentState = await window.recorder.getState();
    if (currentState === 'idle') {
      if (!selectedSource) return;
      await window.recorder.start({
        sourceId: selectedSource,
        fps: 30,
        audioMic,
        audioSystem,
      });
    } else if (currentState === 'recording') {
      await window.recorder.stop(); // result arrives via onFinished
    }
  }, [selectedSource, audioMic, audioSystem]);

  const toggleRef = useRef(handleToggleRecording);
  toggleRef.current = handleToggleRecording;

  const handleRecordArea = useCallback(async () => {
    const currentState = await window.recorder.getState();
    if (currentState === 'idle') {
      await window.recorder.startArea({ fps: 30, audioMic, audioSystem });
    } else if (currentState === 'recording') {
      await window.recorder.stop();
    }
  }, [audioMic, audioSystem]);

  const areaRef = useRef(handleRecordArea);
  areaRef.current = handleRecordArea;

  const handleEffectsChange = useCallback((config: EffectsConfig) => {
    window.recorder.setEffects(config);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Screen Recorder</h1>
      </header>

      <main className="app-main">
        <AreaSelector
          sources={sources}
          selectedSource={selectedSource}
          onSelect={setSelectedSource}
          disabled={state !== 'idle'}
        />

        <AudioToggles
          mic={audioMic}
          system={audioSystem}
          onMicChange={setAudioMic}
          onSystemChange={setAudioSystem}
          disabled={state !== 'idle'}
        />

        <EffectsToggle
          disabled={state !== 'idle'}
          onChange={handleEffectsChange}
        />

        <SaveFolders disabled={state !== 'idle'} />

        <RecordButton
          state={state}
          elapsed={elapsed}
          onToggle={handleToggleRecording}
        />

        {state === 'idle' && (
          <button className="area-btn" onClick={handleRecordArea} title="Drag a box, then record only that area (Ctrl+Shift+A)">
            Record an area instead
          </button>
        )}

        {lastOutput && state === 'idle' && (
          <div className="last-output">
            <p>Saved to: {lastOutput}</p>
            {effectsApplied && <p className="effects-badge">Zoom + Tilt applied</p>}
            <button onClick={() => window.recorder.openOutputFolder()}>
              Open Folder
            </button>
          </div>
        )}
      </main>

      <StatusBar
        state={state}
        selectedSource={sources.find((s) => s.id === selectedSource)?.title || 'None'}
      />
    </div>
  );
}
