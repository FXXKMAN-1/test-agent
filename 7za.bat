@echo off
setlocal
set args=%*
set args=%args:-snld =%
set args=%args:-snld=%
"D:\test-agent\node_modules\7zip-bin\win\x64\7za_real.exe" %args%
