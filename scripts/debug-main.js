const { app } = require('electron');

process.on('uncaughtException', (e) => {
  console.error('CRASH:', e.stack || e.message);
  process.exit(1);
});

app.whenReady().then(() => {
  console.log('App ready, loading main...');
  try {
    require('../dist/main/index.js');
  } catch (e) {
    console.error('REQUIRE ERROR:', e.stack || e.message);
    app.quit();
  }
});
