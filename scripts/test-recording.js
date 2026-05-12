const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ADDON_PATH = path.join(__dirname, '../native/build/screen_recorder_native.node');
const OUTPUT_DIR = path.join(__dirname, '../test-output');
const FFMPEG_PATH = 'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Screen Recorder Integration Test ===\n');

  // 1. Load native addon
  console.log('1. Loading native addon...');
  let native;
  try {
    native = require(ADDON_PATH);
    console.log('   OK - Native addon loaded\n');
  } catch (err) {
    console.error('   FAIL - Cannot load native addon:', err.message);
    process.exit(1);
  }

  // 2. Enumerate sources
  console.log('2. Enumerating capture sources...');
  const sources = native.enumerateSources();
  console.log(`   Found ${sources.length} sources:`);
  sources.slice(0, 5).forEach(s => {
    console.log(`   - [${s.type}] ${s.title} (${s.width}x${s.height})`);
  });
  if (sources.length === 0) {
    console.error('   FAIL - No sources found');
    process.exit(1);
  }
  console.log('   OK\n');

  // 3. Prepare output directory
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const sessionId = Date.now().toString();
  const pipeName = `\\\\.\\pipe\\screen-recorder-test-${sessionId}`;
  const screenOutput = path.join(OUTPUT_DIR, 'screen_raw.mp4');
  const systemAudioOutput = path.join(OUTPUT_DIR, 'system_raw.wav');
  const micAudioOutput = path.join(OUTPUT_DIR, 'mic_raw.wav');
  const cursorOutput = path.join(OUTPUT_DIR, 'cursor_events.json');
  const finalOutput = path.join(OUTPUT_DIR, 'final.mp4');

  // Clean previous test files
  [screenOutput, systemAudioOutput, micAudioOutput, cursorOutput, finalOutput].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  // Pick first monitor source
  const source = sources.find(s => s.type === 'monitor') || sources[0];
  console.log(`3. Recording source: ${source.title} (${source.width}x${source.height})`);
  console.log(`   Pipe: ${pipeName}\n`);

  // 4. Start screen capture first (creates named pipe server, waits for client)
  console.log('4. Starting screen capture (creates pipe server)...');
  const captureOk = native.startCapture(source.id, 30, pipeName);
  if (!captureOk) {
    console.error('   FAIL - startCapture returned false');
    process.exit(1);
  }
  console.log('   OK - Capture started (pipe server created)\n');

  // Give the capture thread time to create the pipe
  await sleep(500);

  // 5. Start FFmpeg (connects to pipe as client)
  console.log('5. Starting FFmpeg encoder (connects to pipe)...');
  const ffmpegArgs = [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'bgra',
    '-video_size', `${source.width}x${source.height}`,
    '-framerate', '30',
    '-i', pipeName,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    screenOutput,
  ];

  const ffmpeg = spawn(FFMPEG_PATH, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  let ffmpegStderr = '';
  ffmpeg.stderr.on('data', d => { ffmpegStderr += d.toString(); });
  ffmpeg.on('error', err => console.error('   FFmpeg error:', err.message));

  // Give FFmpeg time to connect to the pipe
  await sleep(1000);
  console.log('   OK - FFmpeg connected\n');

  // 6. Start audio capture
  console.log('6. Starting audio capture...');
  const loopbackOk = native.startAudioCapture(systemAudioOutput, 'loopback');
  console.log(`   System audio (loopback): ${loopbackOk ? 'OK' : 'FAIL'}`);
  const micOk = native.startAudioCapture(micAudioOutput, 'mic');
  console.log(`   Microphone: ${micOk ? 'OK' : 'FAIL (no mic?)'}\n`);

  // 7. Start cursor tracking
  console.log('7. Starting cursor tracking at 60Hz...');
  native.startCursorTracking(60);
  console.log('   OK\n');

  // 8. Record for 5 seconds
  console.log('8. Recording for 5 seconds...');
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`   ${i}...`);
    await sleep(1000);
  }
  console.log(' done!\n');

  // 9. Stop everything
  console.log('9. Stopping capture...');
  native.stopCapture();
  console.log('   Screen capture stopped');

  native.stopAudioCapture('loopback');
  console.log('   System audio stopped');

  native.stopAudioCapture('mic');
  console.log('   Mic audio stopped');

  const cursorEvents = native.stopCursorTracking();
  console.log(`   Cursor tracking stopped (${cursorEvents.length} events)\n`);

  // Write cursor log
  fs.writeFileSync(cursorOutput, JSON.stringify(cursorEvents, null, 2));

  // 10. Wait for FFmpeg to finish
  console.log('10. Waiting for FFmpeg to finish encoding...');
  await new Promise((resolve, reject) => {
    ffmpeg.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
    // FFmpeg should finish once the pipe is closed (capture stopped)
    setTimeout(() => {
      ffmpeg.kill();
      resolve();
    }, 10000);
  });
  console.log('    OK\n');

  // 11. Mux audio if video exists
  if (fs.existsSync(screenOutput) && fs.statSync(screenOutput).size > 0) {
    console.log('11. Muxing audio into final output...');
    const muxArgs = ['-y', '-i', screenOutput];
    if (fs.existsSync(systemAudioOutput) && fs.statSync(systemAudioOutput).size > 44) {
      muxArgs.push('-i', systemAudioOutput);
    }
    muxArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', finalOutput);

    await new Promise((resolve) => {
      const mux = spawn(FFMPEG_PATH, muxArgs, { stdio: 'pipe' });
      mux.on('exit', resolve);
      setTimeout(() => { mux.kill(); resolve(); }, 15000);
    });
    console.log('    OK\n');
  }

  // 12. Report results
  console.log('=== Results ===\n');
  const files = [
    { name: 'Screen video', path: screenOutput },
    { name: 'System audio', path: systemAudioOutput },
    { name: 'Mic audio', path: micAudioOutput },
    { name: 'Cursor events', path: cursorOutput },
    { name: 'Final output', path: finalOutput },
  ];

  let allGood = true;
  files.forEach(f => {
    if (fs.existsSync(f.path)) {
      const size = fs.statSync(f.path).size;
      const sizeStr = size > 1024*1024
        ? `${(size/1024/1024).toFixed(1)} MB`
        : `${(size/1024).toFixed(1)} KB`;
      console.log(`  [OK]   ${f.name}: ${sizeStr} - ${f.path}`);
    } else {
      console.log(`  [MISS] ${f.name}: not created - ${f.path}`);
      allGood = false;
    }
  });

  // Show cursor event sample
  if (cursorEvents.length > 0) {
    console.log(`\n  Cursor sample (first 3 events):`);
    cursorEvents.slice(0, 3).forEach(e => {
      console.log(`    t=${e.t.toFixed(3)}s x=${e.x} y=${e.y} event=${e.event}`);
    });
  }

  console.log(`\n=== ${allGood ? 'ALL PASSED' : 'SOME MISSING'} ===`);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
