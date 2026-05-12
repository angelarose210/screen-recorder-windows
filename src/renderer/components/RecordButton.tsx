interface RecordButtonProps {
  state: string;
  elapsed: number;
  onToggle: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function RecordButton({ state, elapsed, onToggle }: RecordButtonProps) {
  const isRecording = state === 'recording';
  const isProcessing = state === 'preparing' || state === 'stopping' || state === 'saving';

  return (
    <div className="record-section">
      <button
        className={`record-btn ${isRecording ? 'recording' : ''}`}
        onClick={onToggle}
        disabled={isProcessing}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        <div className="inner" />
      </button>
      {(isRecording || elapsed > 0) && (
        <div className="elapsed-timer">{formatTime(elapsed)}</div>
      )}
      {isProcessing && (
        <div className="elapsed-timer" style={{ fontSize: 13, color: '#888' }}>
          {state === 'preparing' ? 'Preparing...' : 'Saving...'}
        </div>
      )}
    </div>
  );
}
