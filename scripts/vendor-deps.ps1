[CmdletBinding()]
param(
  [string]$VapourSynthVersion = "R72",
  [string]$VapourSynthInstallerUrl = "https://github.com/vapoursynth/vapoursynth/releases/download/R72/Install-Portable-VapourSynth-R72.ps1",

  [string[]]$VsRepoPlugins = @(
    "bs",
    "placebo",
    "bwdif",
    "nnedi3",
    "znedi3",
    "mvtools",
    "fmtconv",
    "eedi3m",
    "sangnom",
    "dfttest",
    "fft3dfilter",
    "knlmeanscl",
    "rgvs",
    "addgrain",
    "tcanny",
    "ctmf",
    "dctfilter",
    "misc",
    "akarin",
    "descale",
    "havsfunc",
    "vsutil"
  ),

  [string[]]$PipModules = @(),

  [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root "app\vendor"
$vsDir = Join-Path $vendor "vapoursynth"
$stamp = Join-Path $vendor ".vendor-complete"
$work = Join-Path $env:TEMP "pear-vendor"

function Test-BundleComplete {
  (Test-Path (Join-Path $vsDir "vsscript.dll")) -and
  (Test-Path $stamp) -and
  ((Get-Content $stamp -Raw -ErrorAction SilentlyContinue).Trim() -eq $VapourSynthVersion)
}

if (-not $Force -and (Test-BundleComplete)) {
  Write-Host "Vendored bundle already present ($VapourSynthVersion) at $vendor - skipping. Use -Force to rebuild."
  return
}

New-Item -ItemType Directory -Force -Path $vendor, $work | Out-Null

function Get-File($url, $dest) {
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

if (Test-Path $vsDir) { Remove-Item -Recurse -Force $vsDir }
$installer = Join-Path $work "Install-Portable-VapourSynth.ps1"
Get-File $VapourSynthInstallerUrl $installer
Unblock-File $installer
$vsNum = [int]($VapourSynthVersion -replace '^[Rr]', '')
& $installer -Unattended -TargetFolder $vsDir -VSVersion $vsNum
if (-not (Test-Path (Join-Path $vsDir "VSScript.dll"))) {
  throw "VSScript.dll not found under $vsDir - the portable VapourSynth install did not complete."
}
Remove-Item -Recurse -Force (Join-Path $vsDir "vs-temp-dl") -ErrorAction SilentlyContinue

$py = Join-Path $vsDir "python.exe"
if (-not (Test-Path $py)) { throw "Embedded python.exe not found under $vsDir" }
$vsrepo = Join-Path $vsDir "vsrepo.py"
if (-not (Test-Path $vsrepo)) {
  $found = Get-ChildItem -Path $vsDir -Filter "vsrepo.py" -Recurse | Select-Object -First 1
  if (-not $found) { throw "vsrepo.py not found under $vsDir" }
  $vsrepo = $found.FullName
}

Push-Location $work
try {
  & $py $vsrepo update
  Write-Host "vsrepo install $($VsRepoPlugins -join ' ')"
  $out = & $py $vsrepo install $VsRepoPlugins 2>&1
  $installCode = $LASTEXITCODE
  $out | ForEach-Object { Write-Host $_ }
} finally {
  Pop-Location
}
$missing = @()
foreach ($line in $out) {
  if ("$line" -match 'Package (.+) not found') { $missing += $matches[1].Trim() }
}
if ($installCode -ne 0 -or $missing.Count -gt 0) {
  throw "vsrepo could not install: $($missing -join ', '). Fix the id(s) in `$VsRepoPlugins (cross-check with '$py $vsrepo available')."
}

if ($PipModules.Count -gt 0) {
  & $py -m pip install --upgrade pip
  foreach ($m in $PipModules) {
    Write-Host "pip install $m"
    & $py -m pip install $m
    if ($LASTEXITCODE -ne 0) { throw "pip install $m failed" }
  }
}

$verify = @'
import vapoursynth as vs
core = vs.core
need = ["bs","placebo","bwdif","nnedi3","znedi3","mv","fmtc","eedi3m","sangnom","dfttest",
        "fft3dfilter","knlm","rgvs","grain","tcanny","ctmf","dctf","akarin","descale","misc"]
missing = [n for n in need if not hasattr(core, n)]
if missing:
    raise SystemExit("missing plugins: " + ", ".join(missing))
import havsfunc
if not hasattr(havsfunc, "QTGMC"):
    raise SystemExit("havsfunc.QTGMC missing")
print("bundle verify OK")
'@
$verifyPy = Join-Path $work "verify.py"
Set-Content -Path $verifyPy -Value $verify -Encoding UTF8
$env:PATH = "$vsDir;$env:PATH"
& $py $verifyPy
if ($LASTEXITCODE -ne 0) { throw "Bundle verification failed (see above) - the assembled tree is not usable." }

Set-Content -Path $stamp -Value $VapourSynthVersion -NoNewline

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Vendored bundle assembled at: $vendor ($VapourSynthVersion)"
Write-Host "The installer picks it up automatically (see resources in app/tauri.conf.json)."
