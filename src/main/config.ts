import Store from 'electron-store';

export interface AppSettings {
  fps: 30 | 60;
  outputDir: string;
  lastMode: 'quick' | 'polished';
  audioMicDefault: boolean;
  audioSystemDefault: boolean;
}

const defaults: AppSettings = {
  fps: 30,
  outputDir: '',
  lastMode: 'quick',
  audioMicDefault: true,
  audioSystemDefault: true,
};

const store = new Store<AppSettings>({ defaults });

export function getSettings(): AppSettings {
  return {
    fps: store.get('fps'),
    outputDir: store.get('outputDir'),
    lastMode: store.get('lastMode'),
    audioMicDefault: store.get('audioMicDefault'),
    audioSystemDefault: store.get('audioSystemDefault'),
  };
}

export function setSettings(partial: Partial<AppSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof AppSettings, value);
  }
}
