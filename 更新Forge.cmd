@echo off
chcp 65001 >nul
if /i "%~1"=="rollback" goto rollback
if "%~1"=="" goto usage
node "%~dp0runtime\forge\update-runtime.cjs" install "%~f1"
goto end
:rollback
node "%~dp0runtime\forge\update-runtime.cjs" rollback
goto end
:usage
echo 请把下载好的官方 forge-installer-版本.tar.bz2 拖到本文件。
echo 回退时在终端运行 更新Forge.cmd rollback
exit /b 0
:end
set "result=%errorlevel%"
pause
exit /b %result%
