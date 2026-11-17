@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'Local Rank Tracker.lnk'));$s.TargetPath=[IO.Path]::Combine((Get-Location).Path,'INICIAR_LOCAL_RANK_TRACKER.cmd');$s.WorkingDirectory=(Get-Location).Path;$s.IconLocation=$env:SystemRoot+'\System32\shell32.dll,14';$s.Save()"
if not errorlevel 1 echo Atalho criado na Area de Trabalho.
pause
endlocal
