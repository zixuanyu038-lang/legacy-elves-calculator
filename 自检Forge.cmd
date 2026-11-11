@echo off
chcp 65001 >nul
node "%~dp0runtime\forge\self-test.cjs"
set "result=%errorlevel%"
pause
exit /b %result%
