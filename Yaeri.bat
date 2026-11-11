@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

set "YAERI_SCRIPT=%~dp0launcher\start.ps1"

if not exist "%YAERI_SCRIPT%" (
    echo Ошибка: не найден файл "%YAERI_SCRIPT%".
    pause
    exit /b 1
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo Ошибка: Windows PowerShell не найден.
    pause
    exit /b 1
)

rem Fast-forward updates before launch; safe to skip when offline, in a ZIP, or with local edits.
set "YAERI_UPDATER=%~dp0launcher\yaeri-update.ps1"
if exist "%YAERI_UPDATER%" (
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%YAERI_UPDATER%"
)

rem Install required runtimes on first launch (winget, if available).
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\bootstrap-runtimes.ps1"
if errorlevel 1 (
    echo Не удалось автоматически подготовить Python и Node.js.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%YAERI_SCRIPT%"
set "YAERI_EXIT=%ERRORLEVEL%"

rem Код -1073741510 (0xC000013A) означает остановку по Ctrl+C, это не ошибка.
if not "%YAERI_EXIT%"=="0" if not "%YAERI_EXIT%"=="-1073741510" (
    echo.
    echo Не удалось запустить Яэри. Код ошибки: %YAERI_EXIT%
    pause
)

endlocal & exit /b %YAERI_EXIT%
