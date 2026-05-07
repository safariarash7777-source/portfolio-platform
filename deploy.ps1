# ─────────────────────────────────────────────────────────────────
# Deploy script — Arash Safari Portfolio Platform
# Run from PowerShell inside the project folder:
#   cd C:\Users\arsa\Desktop\portfolio-platform
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
# ─────────────────────────────────────────────────────────────────

Write-Host "=== Step 1: Verify git is initialized ===" -ForegroundColor Cyan
if (-not (Test-Path .git)) {
    git init
    git checkout -B main
    Write-Host "Initialized fresh git repo on main branch." -ForegroundColor Yellow
}

Write-Host "=== Step 2: Configure identity (idempotent) ===" -ForegroundColor Cyan
git config user.email "safariarash7777@gmail.com"
git config user.name  "Arash Safari"

Write-Host "=== Step 3: Verify origin remote ===" -ForegroundColor Cyan
$remote = git remote get-url origin 2>$null
if (-not $remote) {
    Write-Host "No 'origin' remote found." -ForegroundColor Yellow
    $url = Read-Host "Enter your GitHub repo URL (e.g. https://github.com/USER/REPO.git)"
    git remote add origin $url
}

Write-Host "=== Step 4: Stage + commit ===" -ForegroundColor Cyan
git add -A
$staged = git diff --cached --name-only
if ($staged) {
    git commit -m "feat: complete UI/UX overhaul to Light Theme & modular architecture"
} else {
    Write-Host "Nothing to commit." -ForegroundColor Yellow
}

Write-Host "=== Step 5: Push ===" -ForegroundColor Cyan
git push -u origin main

Write-Host "" -ForegroundColor Green
Write-Host "Done." -ForegroundColor Green
