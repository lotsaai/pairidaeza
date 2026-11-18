#MISE description="Build the application (Debug)"
#MISE sources=["Cargo.toml", "Cargo.lock", "crates/*/Cargo.toml", "crates/*/**/*.rs", "crates/pairidaezad/fixtures/**", ".mise/tasks/build/debug.ps1"]
#MISE outputs=["target/debug/pairidaezad.exe", "target/debug/webui.exe"]

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$projectDir = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location -LiteralPath $projectDir
cargo build --quiet --workspace --lib --bins --examples @args
exit $LASTEXITCODE
