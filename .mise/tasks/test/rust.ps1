#MISE description="Run the Rust tests for this project"
#MISE depends=["build:debug"]

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$projectDir = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location -LiteralPath $projectDir -ErrorAction Stop
cargo nextest run --workspace --cargo-quiet --show-progress=bar --status-level=slow @args
exit $LASTEXITCODE
