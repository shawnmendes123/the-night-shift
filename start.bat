@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS installer from https://nodejs.org and run this again. & pause & exit /b)
set PORT=3210
start "" http://localhost:3210
node server\index.js
pause
