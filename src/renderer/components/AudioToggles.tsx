interface AudioTogglesProps {
  mic: boolean;
  system: boolean;
  onMicChange: (on: boolean) => void;
  onSystemChange: (on: boolean) => void;
  disabled: boolean;
}

export default function AudioToggles({ mic, system, onMicChange, onSystemChange, disabled }: AudioTogglesProps) {
  return (
    <div>
      <div className="section-label">Audio</div>
      <div className="audio-toggles">
        <button
          className={`toggle-btn ${mic ? 'active' : ''}`}
          onClick={() => onMicChange(!mic)}
          disabled={disabled}
        >
          Microphone {mic ? 'ON' : 'OFF'}
        </button>
        <button
          className={`toggle-btn ${system ? 'active' : ''}`}
          onClick={() => onSystemChange(!system)}
          disabled={disabled}
        >
          System Audio {system ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
