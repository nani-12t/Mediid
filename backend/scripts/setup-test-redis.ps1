# Test-only portable Redis. No service installation and no production connection.
$ErrorActionPreference = 'Stop'
$redisTestRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.test-data'))
New-Item -ItemType Directory -Force -Path $redisTestRoot | Out-Null
$redisBuildRoot = Join-Path $redisTestRoot 'redis-build'
New-Item -ItemType Directory -Force -Path $redisBuildRoot | Out-Null
$redisArchive = Join-Path $redisBuildRoot 'Redis-8.10.2-Windows-x64-msys2.zip'
if (-not (Test-Path -LiteralPath $redisArchive)) { Invoke-WebRequest -Uri 'https://github.com/redis-windows/redis-windows/releases/download/8.10.2/Redis-8.10.2-Windows-x64-msys2.zip' -OutFile $redisArchive }
if ((Get-FileHash -LiteralPath $redisArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '7c8cebd50347eaa1d9e784da842ed47a4f33394637835531d6614777b950ee85') { throw 'Redis archive checksum mismatch; preserved for inspection.' }
Expand-Archive -LiteralPath $redisArchive -DestinationPath (Join-Path $redisBuildRoot 'portable') -Force
