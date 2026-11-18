#MISE description="Verify Rust and desktop suites on Windows"

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$status = 0
foreach ($suite in @('rust', 'desktop')) {
    mise run "test:$suite" @args
    if ($LASTEXITCODE -ne  0) { $status = $LASTEXITCODE }
}
exit $status
