import { useEffect, useState } from 'react';

type Kind = 'videos' | 'screenshots';

export default function SaveFolders({ disabled }: { disabled: boolean }) {
  const [folders, setFolders] = useState<{ videos: string; screenshots: string } | null>(null);

  useEffect(() => {
    window.recorder.getFolders().then(setFolders);
  }, []);

  const change = async (kind: Kind) => {
    const dir = await window.recorder.selectOutputFolder(kind);
    if (dir) setFolders(await window.recorder.getFolders());
  };

  const row = (kind: Kind, label: string) => (
    <div className="folder-row">
      <span className="folder-label">{label}</span>
      <button
        className="folder-path"
        title={`Open ${folders?.[kind] ?? ''}`}
        onClick={() => window.recorder.openFolder(kind)}
      >
        {folders?.[kind] ?? '...'}
      </button>
      <button className="folder-change" onClick={() => change(kind)} disabled={disabled}>
        Change
      </button>
    </div>
  );

  return (
    <div>
      <div className="section-label">Save To (click a path to open it)</div>
      {row('videos', 'Videos')}
      {row('screenshots', 'Screenshots')}
    </div>
  );
}
