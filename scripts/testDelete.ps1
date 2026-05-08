# Touch server.js to trigger nodemon restart
$path = "c:\Users\User\my-app-name\backend\server.js"
$content = Get-Content $path -Raw
Set-Content $path $content -NoNewline
Write-Host "Restarted. Waiting 3s..."
Start-Sleep 3

# Test the route
try {
  $headers = @{ 'Authorization' = 'Bearer invalid_token' }
  $r = Invoke-WebRequest -Method DELETE -Uri 'http://localhost:3001/api/auth/account' -Headers $headers -ErrorAction Stop
  Write-Host "OK $($r.StatusCode): $($r.Content)"
} catch {
  Write-Host "Status: $($_.Exception.Response.StatusCode)"
  Write-Host "Body: $($_.ErrorDetails.Message)"
}
