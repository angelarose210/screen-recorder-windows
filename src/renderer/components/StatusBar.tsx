interface StatusBarProps {
  state: string;
  selectedSource: string;
}

export default function StatusBar({ state, selectedSource }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span>{selectedSource}</span>
      {state === 'recording' && (
        <span className="recording-indicator">REC</span>
      )}
      {state === 'idle' && <span>Ready</span>}
      {(state === 'preparing' || state === 'stopping' || state === 'saving') && (
        <span>Processing...</span>
      )}
    </div>
  );
}
