' Opens the dashboard (starts the server if needed, then opens the browser).
' Runs PowerShell fully hidden (window style 0 = no console flash).
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & d & "\start_dashboard.ps1""", 0, False
