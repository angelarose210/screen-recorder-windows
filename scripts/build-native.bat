@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
set "PATH=C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64;%PATH%"
cd /d "C:\Users\admin\Desktop\claude_code\screen recorder app\screen-recorder"
npx cmake-js rebuild --directory native --runtime electron --runtime-version 33.4.11 --arch x64 -G "NMake Makefiles"
