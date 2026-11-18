#MISE description="Run the development API"
#MISE depends=["build:debug"]

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$projectDir = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location -LiteralPath $projectDir
& ./target/debug/pairidaezad.exe @args
exit $LASTEXITCODE
