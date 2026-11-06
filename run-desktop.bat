@echo off
setlocal
set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;C:\Program Files\nodejs;%PATH%"

echo =========================================================================
echo    Wanchai Printing - Desktop ERP Application Launcher
echo    (SA 5.pdf Pages 182-194)
echo =========================================================================
echo.

node launch-desktop.js

endlocal
