# claude-wait-dev-ready.ps1
# Purpose: wait until the local Next.js dev server is accepting connections,
#          then print the ready port + URL. Read-only helper for Claude Code
#          permission stability (replaces ad-hoc Temp-path wait commands).
#
# Scope (hard limits):
#   - localhost (127.0.0.1) TCP connect check ONLY
#   - candidate ports: 3000, 3001, 3002, 3003
#   - max wait: 45 seconds
#   - NO file writes, NO DB access, NO git, NO deploy, NO external URL calls
#
# Exit codes:
#   0  -> a dev server port is ready (prints DEV_READY ...)
#   1  -> timeout, no port ready within 45s (prints DEV_WAIT_TIMEOUT ...)

$ErrorActionPreference = "Stop"

$ports = @(3000, 3001, 3002, 3003)
$timeoutSeconds = 45
$deadline = (Get-Date).AddSeconds($timeoutSeconds)

while ((Get-Date) -lt $deadline) {
    foreach ($port in $ports) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect("127.0.0.1", $port)
            if ($client.Connected) {
                $client.Close()
                Write-Output "DEV_READY port=$port url=http://localhost:$port"
                exit 0
            }
        }
        catch {
            # port not open yet; try the next candidate
        }
        finally {
            $client.Dispose()
        }
    }
    Start-Sleep -Milliseconds 800
}

Write-Output "DEV_WAIT_TIMEOUT no dev server on ports 3000-3003 after ${timeoutSeconds}s"
exit 1
