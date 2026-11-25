# Build a Windows x64 portable distribution from committed source.
# Run once on an online Windows x64 build machine; target PCs need no npm install.
[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\portable-dist'))
$ErrorActionPreference = 'Stop'
function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}
if ($env:OS -ne 'Windows_NT') { throw 'Build on Windows x64, not Linux or macOS.' }
$node = (Get-Command node.exe).Source
$nodeDir = Split-Path $node
$platform = & $node -p "process.platform + ' ' + process.arch + ' ' + process.versions.node"
if ($LASTEXITCODE -ne 0 -or $platform -notmatch '^win32 x64 24\.') { throw "Requires Windows x64 Node.js 24: $platform" }
$npm = Join-Path $nodeDir 'npm.cmd'
$npmModule = Join-Path $nodeDir 'node_modules\npm'
if (!(Test-Path $npm) -or !(Test-Path $npmModule)) { throw 'Use an official Node.js 24 distribution containing npm.' }
$npmVersion = & $npm --version
if ($LASTEXITCODE -ne 0 -or $npmVersion -notmatch '^11\.') { throw "Requires npm 11: $npmVersion" }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ('tech-cockpit-' + [guid]::NewGuid())
$stage = Join-Path $temp 'TechCockpit'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$oldPath = $env:Path
$oldNodeEnv = $env:NODE_ENV
$oldPlaywright = $env:PLAYWRIGHT_BROWSERS_PATH
try {
  Push-Location $repoRoot
  try {
    $sha = & git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Cannot determine source commit.' }
    Invoke-Checked 'git' @('archive','--format=tar',"-o=$temp\source.tar",'HEAD')
  } finally { Pop-Location }
  Invoke-Checked 'tar.exe' @('-xf',"$temp\source.tar",'-C',$stage)
  $runtime = Join-Path $stage 'runtime'
  New-Item -ItemType Directory -Force -Path "$runtime\node_modules" | Out-Null
  Copy-Item $node "$runtime\node.exe"
  foreach ($name in @('npm.cmd','npx.cmd','LICENSE','LICENSE.txt')) {
    if (Test-Path (Join-Path $nodeDir $name)) { Copy-Item (Join-Path $nodeDir $name) $runtime }
  }
  Copy-Item $npmModule "$runtime\node_modules\npm" -Recurse
  $env:Path = "$runtime;$oldPath"
  $env:NODE_ENV = 'development'
  foreach ($app in @('ReactTS_Frontend','NestJS_Backend')) {
    Push-Location (Join-Path $stage $app)
    try {
      Invoke-Checked "$runtime\npm.cmd" @('ci','--include=dev','--include=optional','--no-audit','--no-fund')
      Invoke-Checked "$runtime\npm.cmd" @('run','build')
      # Record actual installed package locations and versions, including nested modules.
      $inventory = & "$runtime\node.exe" -e 'const fs=require("fs"),path=require("path");const a=[];function walk(d){if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){if(!e.isDirectory()||e.name.startsWith("."))continue;const p=path.join(d,e.name);if(e.name.startsWith("@")){walk(p);continue}const j=path.join(p,"package.json");if(fs.existsSync(j)){const x=JSON.parse(fs.readFileSync(j,"utf8"));a.push({name:x.name,version:x.version,path:p.replaceAll("\\","/")})}walk(path.join(p,"node_modules"))}}walk("node_modules");console.log(JSON.stringify(a,null,2))'
      if ($LASTEXITCODE -ne 0) { throw 'Package inventory failed.' }
      $inventory | Set-Content -Encoding UTF8 (Join-Path $stage "$app-modules.json")
    } finally { Pop-Location }
  }
  @'
@echo off
setlocal
set "PATH=%~dp0runtime;%PATH%"
cd /d "%~dp0ReactTS_Frontend"
call "%~dp0runtime\npm.cmd" run dev -- --host 127.0.0.1
'@ | Set-Content -Encoding ASCII "$stage\Start-Frontend.cmd"
  @'
@echo off
setlocal
set "PATH=%~dp0runtime;%PATH%"
cd /d "%~dp0NestJS_Backend"
if not exist ".env" (
  echo Configure NestJS_Backend\.env with approved local database and authentication settings first.
  exit /b 1
)
call "%~dp0runtime\npm.cmd" run start:dev
'@ | Set-Content -Encoding ASCII "$stage\Start-Backend.cmd"
  @"
Tech Cockpit portable distribution
Source commit: $sha
Platform: $platform
npm: $npmVersion
Extract the entire archive before running Start-Frontend.cmd or Start-Backend.cmd.
No Node.js or npm installation is required on the target PC.
Frontend: http://127.0.0.1:5173
Backend requires approved .env, PostgreSQL and authentication/services as applicable.
Playwright browser binaries are not included; browser E2E tests need them separately.
Installed npm package inventories are in the two *-modules.json files.
Do not use these node_modules on Linux, macOS or Windows ARM64.
"@ | Set-Content -Encoding UTF8 "$stage\PORTABLE-README.txt"
  $zip = Join-Path $OutputDirectory "tech-cockpit-windows-x64-$($sha.Substring(0,12)).zip"
  if (Test-Path $zip) { Remove-Item $zip }
  Invoke-Checked 'tar.exe' @('-a','-cf',$zip,'-C',$temp,'TechCockpit')
  $hash = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
  "$hash  $(Split-Path $zip -Leaf)" | Set-Content -Encoding ASCII "$zip.sha256"
  Write-Host "Created $zip"
} finally {
  $env:Path = $oldPath
  $env:NODE_ENV = $oldNodeEnv
  $env:PLAYWRIGHT_BROWSERS_PATH = $oldPlaywright
  Remove-Item -LiteralPath $temp -Recurse -Force
}
