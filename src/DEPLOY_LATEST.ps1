$ErrorActionPreference = "Stop"
Write-Host "RAN EP7 - BUILD AND DEPLOY LATEST BASELINE" -ForegroundColor Cyan
& "$PSScriptRoot\VERIFY_BASELINE.ps1"
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
Write-Host "Building production bundle..." -ForegroundColor Yellow
npm run build
if(!(Test-Path "$PSScriptRoot\dist\index.html")){ throw "Build failed: dist/index.html not found." }
Write-Host "Deploying dist to GitHub Pages..." -ForegroundColor Yellow
npx gh-pages -d dist
Write-Host "DONE." -ForegroundColor Green
