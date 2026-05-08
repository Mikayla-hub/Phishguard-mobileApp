$uri = "http://localhost:3001/api/auth/2fa/send"
$headers = @{ "Authorization" = "Bearer invalid_token" }
$body = "{}"

try {
  $response = Invoke-WebRequest -Method POST -Uri $uri -Headers $headers -ContentType "application/json" -Body $body -UseBasicParsing
  Write-Host "Status: $($response.StatusCode)"
  Write-Host "Body: $($response.Content)"
} catch {
  $statusCode = $_.Exception.Response.StatusCode
  $rawStream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($rawStream)
  $errorBody = $reader.ReadToEnd()
  Write-Host "Status: $statusCode"
  Write-Host "Body: $errorBody"
}
