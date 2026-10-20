param([string]$PostgresRoot = 'C:\Program Files\PostgreSQL\18')
$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$buildRoot = Join-Path $backendRoot '.test-data\pgvector-build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$archivePath = Join-Path $buildRoot 'pgvector-v0.8.2.zip'
$expectedHash = 'f218184e82d6307ed12839955e6f8ad70bdb1afa6e9a343507c16d6ea5cbbf15'
if (!(Test-Path -LiteralPath $archivePath)) {
 Invoke-WebRequest -Uri 'https://codeload.github.com/pgvector/pgvector/zip/refs/tags/v0.8.2' -OutFile $archivePath -UseBasicParsing
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'pgvector archive checksum mismatch' }
if (!(Test-Path -LiteralPath (Join-Path $PostgresRoot 'include\server\postgres.h'))) { throw 'PostgreSQL server headers are required' }
$vswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsRoot = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vsRoot) { throw 'Visual Studio C++ Build Tools are required' }
$vcvars = Join-Path $vsRoot 'VC\Auxiliary\Build\vcvars64.bat'
Expand-Archive -LiteralPath $archivePath -DestinationPath $buildRoot -Force
$sourceDir = Join-Path $buildRoot 'pgvector-0.8.2'
$previousPgRoot = $env:PGROOT
Push-Location -LiteralPath $sourceDir
try {
 $env:PGROOT = $PostgresRoot
 $ErrorActionPreference = 'Continue'
 & cmd.exe /d /c ('call "' + $vcvars + '" >nul && nmake /A /F Makefile.win') *> (Join-Path $buildRoot 'build.log')
 if ($LASTEXITCODE -ne 0) { throw 'pgvector build failed; see ignored .test-data/pgvector-build/build.log' }
} finally { $ErrorActionPreference = 'Stop'; $env:PGROOT = $previousPgRoot; Pop-Location }
$stagedRoot = Join-Path $buildRoot 'staged'
$extensionDir = Join-Path $stagedRoot 'extension'
New-Item -ItemType Directory -Path $extensionDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir 'vector.dll') -Destination (Join-Path $stagedRoot 'vector.dll') -Force
$modulePath = (Join-Path $stagedRoot 'vector').Replace([char]92,[char]47).Replace("'","''")
$control = [IO.File]::ReadAllText((Join-Path $sourceDir 'vector.control'))
$control = [regex]::Replace($control, '(?m)^module_pathname = .*$', "module_pathname = '$modulePath'")
[IO.File]::WriteAllText((Join-Path $extensionDir 'vector.control'), $control)
Get-ChildItem -LiteralPath (Join-Path $sourceDir 'sql') -Filter 'vector--*.sql' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $extensionDir $_.Name) -Force }
Write-Output 'Built pgvector 0.8.2 for disposable PostgreSQL 18 clusters only. System extension files were not changed.'
