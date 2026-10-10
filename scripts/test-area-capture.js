// Records a fixed 640x360 area at (200,150) of the primary monitor for 3s via the real Recorder.
// Run with: node_modules/electron/dist/electron.exe scripts/test-area-capture.js
const { app } = require('electron');
const path = require('path');
const os = require('os');

app.whenReady().then(async () => {
  try {
    const { Recorder } = require(path.join(__dirname, '../dist/main/recorder.js'));
    const rec = new Recorder();
    const mon = rec.getSources().find((s) => s.type === 'monitor' && s.title.includes('Primary'));
    console.log('monitor', JSON.stringify(mon));
    await rec.start({
      sourceId: mon.id, fps: 30, audioMic: false, audioSystem: false,
      outputDir: os.tmpdir(), region: { x: 200, y: 150, width: 641, height: 361 },
    });
    await new Promise((r) => setTimeout(r, 3000));
    console.log('RESULT', JSON.stringify(await rec.stop()));
  } catch (e) {
    console.error('FAIL', e);
  }
  app.exit(0);
});
