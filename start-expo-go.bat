@echo off
setlocal
cd /d "%~dp0"

if not exist package.json (
  echo Could not find package.json in:
  echo %CD%
  echo.
  echo Open the OnlyDead project folder from GitHub and run this file there.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the current Node.js LTS release, then run this file again.
  pause
  exit /b 1
)

echo Syncing app dependencies from package-lock.json.
call npm install
if errorlevel 1 goto failed

echo Starting OnlyDead for Expo Go. Scan the QR code shown below with Expo Go on Android.
echo Press Ctrl+C in this window to stop the app.
call npx expo start -c
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Expo could not start. Copy the error above so it can be diagnosed.
pause
exit /b 1
