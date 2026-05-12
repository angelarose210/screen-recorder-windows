const { execSync } = require('child_process');
const path = require('path');

// Only rebuild native addon if cmake-js and native source exist
const nativeDir = path.join(__dirname, '..', 'native');
const fs = require('fs');

if (fs.existsSync(path.join(nativeDir, 'CMakeLists.txt'))) {
  try {
    const electronVersion = require('electron/package.json').version;
    console.log(`Rebuilding native addon for Electron ${electronVersion}...`);
    execSync(
      `npx cmake-js rebuild --directory native --runtime electron --runtime-version ${electronVersion} --arch x64`,
      { stdio: 'inherit', cwd: path.join(__dirname, '..') }
    );
    console.log('Native addon built successfully.');
  } catch (err) {
    console.warn('Native addon build failed (may not have build tools installed):', err.message);
    console.warn('The app will run without native capture. Install Visual Studio C++ tools to enable.');
  }
} else {
  console.log('No native CMakeLists.txt found, skipping native build.');
}
