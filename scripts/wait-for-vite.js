const http = require('http');

function checkVite() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5173', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkVite()) {
      console.log('Vite dev server is ready.');
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.warn('Vite dev server not detected, launching Electron anyway...');
}

main();
