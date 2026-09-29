@echo off
rem Test-only wrapper: runs the real Supabase CLI, then lets fault.ps1 damage
rem the data dump on purpose (BK_FAULT). Not part of the backup tool.
call npx.cmd --yes supabase@2.117.0 %*
if errorlevel 1 exit /b %errorlevel%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fault.ps1" %*
exit /b %errorlevel%
