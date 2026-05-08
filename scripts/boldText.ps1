$dir = "c:\Users\User\my-app-name\myscreens"
$files = Get-ChildItem "$dir\*.js"

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw

  # fontWeight thinning -> semi-bold
  $content = $content -replace 'fontWeight:\s*"400"', 'fontWeight: "600"'
  $content = $content -replace "fontWeight:\s*'400'", "fontWeight: '600'"
  $content = $content -replace 'fontWeight:\s*"300"', 'fontWeight: "600"'
  $content = $content -replace "fontWeight:\s*'300'", "fontWeight: '600'"

  # Washed-out grey text -> darker readable grey
  $content = $content -replace 'color:\s*"#888888"', 'color: "#444444"'
  $content = $content -replace "color:\s*'#888888'", "color: '#444444'"
  $content = $content -replace 'color:\s*"#888"', 'color: "#444"'
  $content = $content -replace "color:\s*'#888'", "color: '#444'"
  $content = $content -replace 'color:\s*"#999"', 'color: "#555"'
  $content = $content -replace "color:\s*'#999'", "color: '#555'"
  $content = $content -replace 'color:\s*"#aaa"', 'color: "#666"'
  $content = $content -replace "color:\s*'#aaa'", "color: '#666'"
  $content = $content -replace 'color:\s*"#bbbbbb"', 'color: "#555555"'

  # Body text: #666 -> #333 (much more readable)
  $content = $content -replace 'color:\s*"#666666"', 'color: "#333333"'
  $content = $content -replace "color:\s*'#666666'", "color: '#333333'"
  $content = $content -replace 'color:\s*"#666"', 'color: "#333"'
  $content = $content -replace "color:\s*'#666'", "color: '#333'"

  # fontSize boosts for labels/descriptions
  $content = $content -replace 'fontSize:\s*11,', 'fontSize: 12,'
  $content = $content -replace 'fontSize:\s*10,', 'fontSize: 11,'

  Set-Content $file.FullName $content -NoNewline
  Write-Host "Updated: $($file.Name)"
}
Write-Host "Done."
