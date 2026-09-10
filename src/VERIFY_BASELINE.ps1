$ErrorActionPreference = "Stop"
Write-Host "RAN EP7 BASELINE VERIFICATION" -ForegroundColor Cyan
Write-Host "Project: $((Get-Location).Path)"

$required = @(
  "package.json","package-lock.json","index.html","main.jsx","App.jsx",
  "pages/BHPage.jsx","pages/CWPage.jsx","pages/RaidPage.jsx","pages/TicketPage.jsx","pages/AdminPage.jsx",
  "components/GuideManual.jsx","components/common/Header.jsx","components/common/Modal.jsx",
  "lib/firebase.js","lib/constants.js","lib/guildAudit.js","lib/adminBackup.js","lib/displayTimezone.js","lib/time.js",
  "firestore.rules","storage.rules","firebase.json","vite.config.js"
)
foreach($p in $required){ if(!(Test-Path $p)){ throw "MISSING REQUIRED FILE: $p" } }

if(Test-Path "src") { throw "INVALID PROJECT ROOT: nested src directory found. Run from the extracted project root." }
if(Test-Path "src/src") { throw "OLD DUPLICATE SOURCE FOUND: src/src" }

$bh = Get-Content "pages/BHPage.jsx" -Raw
$cw = Get-Content "pages/CWPage.jsx" -Raw
$checks = @(
  @($bh,"UNIFIED ADD PLAYER — ONE OR MANY IGNs","BH unified player add"),
  @($bh,"BH BULK MANAGEMENT","BH bulk management"),
  @($bh,"BULK ADD ATTENDANCE","BH bulk attendance"),
  @($bh,"BULK EDIT PLAYERS","BH bulk player edit"),
  @($bh,"BULK DELETE PLAYERS","BH bulk player delete"),
  @($cw,"CW ROSTER • UNIFIED ADD","CW unified player add"),
  @($cw,"BULK EDIT SALARY","CW bulk salary"),
  @($cw,"BULK ASSIGN ITEM","CW bulk item assign"),
  @($cw,"BULK ADD ATTENDANCE","CW bulk attendance"),
  @($cw,"BULK EDIT PLAYERS","CW bulk player edit"),
  @($cw,"BULK DELETE PLAYERS","CW bulk player delete")
)
foreach($c in $checks){ if(!$c[0].Contains($c[1])){ throw "MISSING FEATURE: $($c[2])" } }

$old = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.Extension -in '.jsx','.js','.html','.css' } | Select-String -Pattern 'Create a new active player and add them to the guild roster.|ADD PLAYER & VIEW ROSTER' -SimpleMatch
if($old){ throw "OLD PLAYER MODAL TEXT FOUND IN SOURCE." }

Write-Host "PASS: project structure" -ForegroundColor Green
Write-Host "PASS: BH bulk features" -ForegroundColor Green
Write-Host "PASS: CW bulk features" -ForegroundColor Green
Write-Host "PASS: old player modal removed" -ForegroundColor Green
Write-Host "PASS: baseline verification complete" -ForegroundColor Green
