@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 자료변환 웹앱 (닫으면 종료됩니다)
echo ================================================
echo   자료변환 웹앱을 시작합니다...
echo   브라우저가 자동으로 열립니다.
echo   ★ 이 검은 창은 닫지 마세요 (닫으면 서버가 꺼집니다)
echo ================================================
echo.
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" 자료변환_웹.py
echo.
echo [서버가 종료되었습니다] 오류 메시지가 있으면 위 내용을 확인하세요.
pause
