# Deploy the static portfolio to CT 101 (/var/www/portfolio) over ssh root@server + pct push.
# Usage: .\deploy.ps1   (needs the laptop's SSH key for root@server; no build step)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$tgz  = Join-Path $env:TEMP 'portfolio-deploy.tgz'
$ct   = 101
$dest = '/var/www/portfolio'

# Package everything except repo/dev files.
$ex = @('.git', '.gitignore', 'deploy.ps1', 'README.md', 'DESIGN.md')
$items = Get-ChildItem -LiteralPath $root -Force | Where-Object { $ex -notcontains $_.Name } | ForEach-Object { $_.Name }
Push-Location $root
try { tar -czf $tgz @items; if ($LASTEXITCODE) { throw 'tar failed' } } finally { Pop-Location }

scp -q $tgz root@server:/tmp/portfolio-deploy.tgz
if ($LASTEXITCODE) { throw 'scp failed' }
ssh root@server "pct push $ct /tmp/portfolio-deploy.tgz /tmp/portfolio-deploy.tgz && rm /tmp/portfolio-deploy.tgz && pct exec $ct -- sh -c 'mkdir -p $dest && tar -xzf /tmp/portfolio-deploy.tgz -C $dest --no-same-owner && rm /tmp/portfolio-deploy.tgz'"
if ($LASTEXITCODE) { throw 'remote extract failed' }
Remove-Item $tgz -Force

$code = (curl.exe -s -o NUL -w '%{http_code}' https://central-proxy.bluebuck-tailor.ts.net/portfolio/)
Write-Host "Deployed. /portfolio/ -> HTTP $code"