const { app, BrowserWindow } = require('electron');

process.on('uncaughtException', (e) => {
  require('fs').writeFileSync('crash.log', e.stack || e.message);
  console.error('CRASH:', e.message);
  process.exit(1);
});

app.whenReady().then(() => {
  console.log('App ready');
  const win = new BrowserWindow({ width: 400, height: 300, show: false });
  win.loadURL('http://localhost:5173');
  win.webContents.on('did-finish-load', () => {
    console.log('Page loaded');
    win.show();
  });
  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('Load failed:', code, desc);
  });
  setTimeout(() => {
    console.log('Timeout - quitting');
    app.quit();
  }, 5000);
});
