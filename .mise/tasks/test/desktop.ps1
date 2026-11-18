#MISE description="Verify the desktop application, including native authentication"
#MISE depends=["build:debug"]
#MISE daemons=["api"]
#MISE secrets=["TEST_USER", "TEST_USER_EMAIL", "TEST_PASSWORD"]

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$status = 0
foreach ($pattern in @('./*.test.ts', './*.test.tsx')) {
    foreach ($testFile in Get-ChildItem -Path $pattern -File -Name) {
        if ($testFile -like '*.native.test.tsx' -or $testFile -like '*.headless.test.tsx') {
            nsh test "./$testFile" @args
        } else {
            nsh test "./$testFile" @args --target windows
        }
        if ($LASTEXITCODE -ne 0) { $status = $LASTEXITCODE }
    }
}
exit $status
