# claude-smoke-sync-unauth.ps1
# Purpose: smoke-check that /api/me/sync-state rejects UNAUTHENTICATED access.
#          Both GET and PUT must return HTTP 401. Fixed command for Claude Code
#          permission stability (replaces ad-hoc curl commands).
#
# Scope (hard limits):
#   - localhost ONLY (http://localhost:3000)
#   - NO auth token, NO production URL, NO DB access, NO Supabase access
#   - NO file writes, NO git, NO deploy
#   - PUT body is a harmless empty JSON object; request is expected to 401
#     BEFORE any payload handling (auth gate runs first).
#
# Exit codes:
#   0  -> PASS: GET and PUT both 401
#   1  -> FAIL: unexpected status (gate not 401/401)
#   2  -> NO_SERVER: dev server not reachable on localhost:3000

$ErrorActionPreference = "Stop"

$url = "http://localhost:3000/api/me/sync-state"

function Get-HttpStatus {
    param(
        [string]$Method,
        [string]$Url
    )
    try {
        if ($Method -eq "PUT") {
            $resp = Invoke-WebRequest -Uri $Url -Method PUT -UseBasicParsing `
                -TimeoutSec 10 -ContentType "application/json" -Body "{}"
        }
        else {
            $resp = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 10
        }
        return [int]$resp.StatusCode
    }
    catch {
        $response = $_.Exception.Response
        if ($null -ne $response) {
            try {
                return [int]$response.StatusCode
            }
            catch {
                return -1
            }
        }
        # No HTTP response object => connection refused / server down
        return -1
    }
}

$getStatus = Get-HttpStatus -Method "GET" -Url $url
$putStatus = Get-HttpStatus -Method "PUT" -Url $url

Write-Output "GET  $url -> $getStatus"
Write-Output "PUT  $url -> $putStatus"

if ($getStatus -lt 0 -or $putStatus -lt 0) {
    Write-Output "SMOKE_NO_SERVER dev server not reachable on localhost:3000 (run npm run dev first)"
    exit 2
}

if ($getStatus -eq 401 -and $putStatus -eq 401) {
    Write-Output "SMOKE_PASS both GET and PUT returned 401 (unauth gate ok)"
    exit 0
}

Write-Output "SMOKE_FAIL expected GET=401 PUT=401 but got GET=$getStatus PUT=$putStatus"
exit 1
