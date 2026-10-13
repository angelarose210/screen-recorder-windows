@echo off
rem Builds native\build\screen_recorder_native.node. Needs Visual Studio (or Build Tools) with
rem the "Desktop development with C++" workload, which includes a Windows 10/11 SDK.
setlocal
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo Visual Studio / Build Tools not found. Install "Desktop development with C++" first.
  exit /b 1
)
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSDIR=%%i"
if not defined VSDIR (
  echo No C++ build tools found. Add the "Desktop development with C++" workload in Visual Studio Installer.
  exit /b 1
)
call "%VSDIR%\VC\Auxiliary\Build\vcvarsall.bat" x64 || exit /b 1
cd /d "%~dp0.."
for /f "usebackq tokens=*" %%v in (`node -p "require('electron/package.json').version"`) do set "ELECTRON_VERSION=%%v"
npx cmake-js rebuild --directory native --runtime electron --runtime-version %ELECTRON_VERSION% --arch x64 -G "NMake Makefiles"
