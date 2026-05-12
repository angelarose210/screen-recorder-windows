import { useState, useEffect, useCallback } from 'react';
import RecordButton from './components/RecordButton';
import AreaSelector from './components/AreaSelector';
import AudioToggles from './components/AudioToggles';
import EffectsToggle, { EffectsConfig } from './components/EffectsToggle';
import StatusBar from './components/StatusBar';

declare global {
  interface Window {
    recorder: {
      getSources: () => Promise<any[]>;
      start: (config: any) => Promise<void>;
      stop: () => Promise<{ outputPath: string; cursorLogPath: string; effectsApplied: boolean }>;
      getState: () => Promise<string>;
      setEffects: (config: any) => Promise<void>;
      onStateChange: (cb: (state: string) => void) => void;
      onTimer: (cb: (seconds: number) => void) => void;
      onGlobalShortcut: (cb: (action: string) => void) => void;
      openOutputFolder: () => Promise<void>;
      getSettings: () => Promise<any>;
      setSettings: (settings: any) => Promise<void>;
      selectOutputFolder: () => Promise<string | null>;
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
    window.recorder.onGlobalShortcut((action) => {
      if (action === 'toggle-recording') handleToggleRecording();
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
      const result = await window.recorder.stop();
      setLastOutput(result.outputPath);
      setEffectsApplied(result.effectsApplied);
    }
  }, [selectedSource, audioMic, audioSystem]);

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

        <RecordButton
          state={state}
          elapsed={elapsed}
          onToggle={handleToggleRecording}
        />

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
