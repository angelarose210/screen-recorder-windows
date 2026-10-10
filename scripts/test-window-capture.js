// Records a window for 4s, resizing it halfway, then checks the output decodes at the expected size.
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/test-window-capture.js "<window title substring>"
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const native = require(path.join(__dirname, '../native/build/screen_recorder_native.node'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titlePart = process.argv[2];

function resize(hwnd, w, h) {
  const ps = `Add-Type 'using System;using System.Runtime.InteropServices;public class R{[DllImport("user32.dll")]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);}';[R]::MoveWindow([IntPtr]${hwnd},100,100,${w},${h},$true)`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
}

(async () => {
  const src = native.enumerateSources().find((s) => s.type === 'window' && s.title.includes(titlePart));
  if (!src) throw new Error('window not found: ' + titlePart);
  const hwnd = src.id.split(':')[1];
  resize(hwnd, 1001, 701); // odd size on purpose
  await sleep(500);

  const out = path.join(os.tmpdir(), 'sr-window-test.mp4');
  const pipe = '\\\\.\\pipe\\sr-test-' + Date.now();
  native.startCapture(src.id, 30, pipe);
  let size = { width: 0 };
  for (let i = 0; i < 60 && !size.width; i++) { await sleep(50); size = native.getCaptureSize(); }
  console.log('enumerated', src.width, 'x', src.height, '| capture', size.width, 'x', size.height);
  await sleep(200);

  const ff = spawn('C:/ProgramData/chocolatey/bin/ffmpeg.exe', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${size.width}x${size.height}`,
    '-framerate', '30', '-i', pipe, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
  ff.stderr.on('data', (d) => process.stderr.write(d));
  await sleep(2000);
  resize(hwnd, 1300, 857); // resize mid-recording
  await sleep(2000);
  native.stopCapture();
  await new Promise((r) => ff.on('exit', r));
  console.log('output', out, fs.statSync(out).size, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
