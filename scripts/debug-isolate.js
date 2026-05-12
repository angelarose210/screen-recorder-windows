const { app, BrowserWindow } = require('electron');

process.on('uncaughtException', (e) => {
  const fs = require('fs');
  fs.writeFileSync('C:/Users/admin/Desktop/claude_code/screen recorder app/screen-recorder/crash.log', e.stack || e.message);
  console.error('CRASH:', e.stack);
  app.quit();
});

app.whenReady().then(() => {
  console.log('1. App ready');

  // Test each import individually
  try {
    console.log('2. Loading electron-store...');
    const Store = require('electron-store');
    console.log('3. electron-store OK');
  } catch(e) { console.error('electron-store FAIL:', e.message); }

  try {
    console.log('4. Loading native addon...');
    const path = require('path');
    const n = require(path.join(__dirname, '../native/build/screen_recorder_native.node'));
    console.log('5. Native addon OK, enumerateSources:', typeof n.enumerateSources);
    const sources = n.enumerateSources();
    console.log('6. Sources:', JSON.stringify(sources).slice(0, 200));
  } catch(e) { console.error('Native FAIL:', e.message); }

  try {
    console.log('7. Creating window...');
    const win = new BrowserWindow({ width: 400, height: 300, show: true });
    win.loadURL('http://localhost:5173');
    console.log('8. Window created');
  } catch(e) { console.error('Window FAIL:', e.message); }

  setTimeout(() => { console.log('9. Quitting'); app.quit(); }, 5000);
});
