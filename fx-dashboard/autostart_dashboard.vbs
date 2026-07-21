' Auto-start at login: starts the dashboard server in the background (no browser).
' Runs PowerShell fully hidden (window style 0 = no console flash).
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & d & "\start_dashboard.ps1"" -NoBrowser", 0, False
