// End-to-end: runs the real Recorder class inside Electron on a window, resizing it mid-recording.
// Run with: node_modules/electron/dist/electron.exe scripts/test-recorder-e2e.js "<window title substring>"
const { app } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');

const titlePart = process.argv[process.argv.length - 1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resize(hwnd, w, h) {
  const ps = `Add-Type 'using System;using System.Runtime.InteropServices;public class R{[DllImport("user32.dll")]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);}';[R]::MoveWindow([IntPtr]${hwnd},100,100,${w},${h},$true)`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
}

app.whenReady().then(async () => {
  try {
    const { Recorder } = require(path.join(__dirname, '../dist/main/recorder.js'));
    const rec = new Recorder();
    const src = rec.getSources().find((s) => s.type === 'window' && s.title.includes(titlePart));
    if (!src) throw new Error('window not found');
    const hwnd = src.id.split(':')[1];
    resize(hwnd, 1001, 701);
    await sleep(300);
    await rec.start({ sourceId: src.id, fps: 30, audioMic: true, audioSystem: true, outputDir: path.join(require('os').tmpdir(), 'sr-e2e') });
    await sleep(2000);
    resize(hwnd, 1300, 857);
    await sleep(2000);
    const result = await rec.stop();
    console.log('RESULT', JSON.stringify(result));
  } catch (e) {
    console.error('FAIL', e);
  }
  app.exit(0);
});
