interface AreaSelectorProps {
  sources: Array<{ id: string; title: string; type: string }>;
  selectedSource: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

export default function AreaSelector({ sources, selectedSource, onSelect, disabled }: AreaSelectorProps) {
  const monitors = sources.filter((s) => s.type === 'monitor');
  const windows = sources.filter((s) => s.type === 'window');

  return (
    <div className="area-selector">
      <div className="section-label">Capture Source</div>
      <select
        value={selectedSource || ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
      >
        {monitors.length > 0 && (
          <optgroup label="Monitors">
            {monitors.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </optgroup>
        )}
        {windows.length > 0 && (
          <optgroup label="Windows">
            {windows.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
