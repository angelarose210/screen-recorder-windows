/**
 * Quick test for cursor highlight effect only.
 * Usage: node scripts/test-cursor-highlight.js
 */

const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(__dirname, '..', 'test-output');
const TEST_VIDEO = path.join(TEST_DIR, 'test_input.mp4');
const TEST_CURSOR = path.join(TEST_DIR, 'test_cursor_events.json');
const OUTPUT = path.join(TEST_DIR, 'test_cursor_highlight.mp4');

async function main() {
  if (!fs.existsSync(TEST_VIDEO)) {
    console.error('Run test-effects.js first to create test_input.mp4');
    process.exit(1);
  }

  const { applyCursorHighlight, DEFAULT_CURSOR_HIGHLIGHT } = require('../dist/main/effects/cursor-highlight');

  const cursorEvents = JSON.parse(fs.readFileSync(TEST_CURSOR, 'utf-8'));
  console.log(`Cursor events: ${cursorEvents.length} (${cursorEvents.filter(e => e.event === 'click').length} clicks)`);

  console.log('Applying cursor highlight...');
  const start = Date.now();

  await applyCursorHighlight({
    inputVideo: TEST_VIDEO,
    outputVideo: OUTPUT,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 5,
    cursorEvents,
    config: { ...DEFAULT_CURSOR_HIGHLIGHT },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);

  if (fs.existsSync(OUTPUT)) {
    const stats = fs.statSync(OUTPUT);
    console.log(`Output: ${OUTPUT} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log('PASS');
  } else {
    console.error('FAILED: output not created');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
