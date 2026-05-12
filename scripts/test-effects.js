/**
 * Test script for the post-processing effects pipeline.
 * Creates a synthetic test video and cursor log, then applies zoom + tilt effects.
 *
 * Usage: node scripts/test-effects.js
 * Requires: ffmpeg on PATH or in resources/ffmpeg/
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const TEST_DIR = path.join(__dirname, '..', 'test-output');
const TEST_VIDEO = path.join(TEST_DIR, 'test_input.mp4');
const TEST_CURSOR = path.join(TEST_DIR, 'test_cursor_events.json');
const OUTPUT_VIDEO = path.join(TEST_DIR, 'test_effects_output.mp4');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION = 5; // seconds

function getFFmpegPath() {
  const bundled = path.join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe');
  if (fs.existsSync(bundled)) return bundled;

  // Try system ffmpeg
  try {
    const p = execSync('where ffmpeg', { encoding: 'utf8' }).trim().split('\n')[0];
    if (p && fs.existsSync(p)) return p;
  } catch {}

  return 'ffmpeg';
}

function createTestVideo() {
  console.log('Creating synthetic test video...');
  const ffmpeg = getFFmpegPath();

  // Generate a test pattern video
  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `testsrc=duration=${DURATION}:size=${WIDTH}x${HEIGHT}:rate=${FPS}`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    TEST_VIDEO,
  ];

  const result = require('child_process').spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed with code ${result.status}`);
  }
  console.log(`  Created: ${TEST_VIDEO}`);
}

function createTestCursorLog() {
  console.log('Creating synthetic cursor events...');

  // Simulate cursor movement with clicks at specific times
  const events = [];
  const totalFrames = FPS * DURATION;

  // Initial position
  events.push({
    t: 0,
    x: WIDTH / 2,
    y: HEIGHT / 2,
    event: 'move',
    screen_w: WIDTH,
    screen_h: HEIGHT,
  });

  // Move cursor around and click at specific points
  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / FPS;

    // Circular motion
    const angle = (frame / totalFrames) * Math.PI * 4;
    const radius = 300;
    const x = Math.round(WIDTH / 2 + Math.cos(angle) * radius);
    const y = Math.round(HEIGHT / 2 + Math.sin(angle) * radius);

    events.push({
      t,
      x,
      y,
      event: 'move',
      screen_w: WIDTH,
      screen_h: HEIGHT,
    });
  }

  // Add clicks at t=1s, t=2.5s, t=4s to trigger zoom
  const clickTimes = [1.0, 2.5, 4.0];
  for (const ct of clickTimes) {
    const angle = (ct / DURATION) * Math.PI * 4;
    const radius = 300;
    events.push({
      t: ct,
      x: Math.round(WIDTH / 2 + Math.cos(angle) * radius),
      y: Math.round(HEIGHT / 2 + Math.sin(angle) * radius),
      event: 'click',
      button: 'left',
      screen_w: WIDTH,
      screen_h: HEIGHT,
    });
  }

  // Sort by time
  events.sort((a, b) => a.t - b.t);

  fs.writeFileSync(TEST_CURSOR, JSON.stringify(events, null, 2));
  console.log(`  Created: ${TEST_CURSOR} (${events.length} events, ${clickTimes.length} clicks)`);
}

async function testEffectsPipeline() {
  console.log('\nTesting effects pipeline...');

  // We need to run the TypeScript modules. Use ts-node or compile first.
  // For simplicity, directly require the compiled JS if available, otherwise use ts-node.

  let postProcessRecording;

  try {
    // Try loading compiled output
    const compiled = path.join(__dirname, '..', 'dist', 'main', 'effects', 'post-process.js');
    if (fs.existsSync(compiled)) {
      const mod = require(compiled);
      postProcessRecording = mod.postProcessRecording;
    }
  } catch {}

  if (!postProcessRecording) {
    // Fall back to ts-node
    try {
      require('ts-node').register({
        transpileOnly: true,
        compilerOptions: { module: 'commonjs' }
      });
      const mod = require('../src/main/effects/post-process');
      postProcessRecording = mod.postProcessRecording;
    } catch (err) {
      console.error('Cannot load post-process module. Run `npm run build` first or install ts-node.');
      console.error(err.message);
      process.exit(1);
    }
  }

  // Test 1: Zoom + Tilt + Canvas (full pipeline)
  console.log('\n  [Test 1] Full pipeline: zoom + tilt + canvas...');
  const OUTPUT_FULL = path.join(TEST_DIR, 'test_full_output.mp4');

  const startTime = Date.now();

  try {
    const result = await postProcessRecording({
      rawVideoPath: TEST_VIDEO,
      cursorLogPath: TEST_CURSOR,
      outputPath: OUTPUT_FULL,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      duration: DURATION,
      config: {
        zoom: { enabled: true, zoomLevel: 1.5, holdDuration: 0.6 },
        tilt: { enabled: true, intensity: 'subtle' },
        canvas: { enabled: true, background: '#1a1a2e', padding: 48, borderRadius: 12, shadow: true },
        cursor: { enabled: true, dotSize: 10, dotColor: '#ffcc00', dotOpacity: 0.7, clickRipple: true, rippleColor: '#ffcc00', rippleDuration: 0.4 },
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Done in ${elapsed}s`);
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Zoom: ${result.hasZoom} | Tilt: ${result.hasTilt} | Canvas: ${result.hasCanvas} | Cursor: ${result.hasCursor}`);

    if (fs.existsSync(OUTPUT_FULL)) {
      const stats = fs.statSync(OUTPUT_FULL);
      console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      if (stats.size < 1000) throw new Error('Output file suspiciously small');
      console.log('  PASS');
    } else {
      throw new Error('Output file not created');
    }
  } catch (err) {
    console.error('  FAILED:', err.message);
    process.exit(1);
  }

  // Test 2: Canvas only (no clicks, no zoom/tilt)
  console.log('\n  [Test 2] Canvas only (no cursor events)...');
  const OUTPUT_CANVAS = path.join(TEST_DIR, 'test_canvas_only.mp4');
  const EMPTY_CURSOR = path.join(TEST_DIR, 'empty_cursor.json');
  fs.writeFileSync(EMPTY_CURSOR, '[]');

  try {
    const t2 = Date.now();
    const result = await postProcessRecording({
      rawVideoPath: TEST_VIDEO,
      cursorLogPath: EMPTY_CURSOR,
      outputPath: OUTPUT_CANVAS,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      duration: DURATION,
      config: {
        zoom: { enabled: true },
        tilt: { enabled: true },
        canvas: { enabled: true, background: '#2d1b69', padding: 64, borderRadius: 16, shadow: true },
      },
    });

    console.log(`  Done in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
    console.log(`  Zoom: ${result.hasZoom} | Tilt: ${result.hasTilt} | Canvas: ${result.hasCanvas} | Cursor: ${result.hasCursor}`);

    if (fs.existsSync(OUTPUT_CANVAS)) {
      const stats = fs.statSync(OUTPUT_CANVAS);
      console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      if (stats.size < 1000) throw new Error('Output file suspiciously small');
      console.log('  PASS');
    } else {
      throw new Error('Output file not created');
    }
  } catch (err) {
    console.error('  FAILED:', err.message);
    process.exit(1);
  }

  console.log('\n  ALL TESTS PASSED');
}

async function main() {
  console.log('=== Effects Pipeline Test ===\n');

  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Step 1: Create test video
  createTestVideo();

  // Step 2: Create cursor log with clicks
  createTestCursorLog();

  // Step 3: Run effects pipeline
  await testEffectsPipeline();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
