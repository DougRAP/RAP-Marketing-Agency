# Smoke test for the cart-checkout BFF (Netlify Function)
# Runs against a local `netlify dev` instance — default port 8888.
# Browser → BFF (this script simulates the browser) → engine.
#
# Pre-reqs:
#   1. Spring Boot engine running on http://localhost:8080
#   2. netlify dev running:  cd designer-plan-site && netlify dev
#      - Make sure these env vars are loaded (in .env or Netlify CLI):
#        HMAC_KEY_ID, HMAC_SECRET (dev value lives in application.properties / .env — NOT here)
#        ENGINE_BASE_URL = "http://127.0.0.1:8080"
#        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for lead_events)

$bffUrl = "http://localhost:8888/.netlify/functions/cart-checkout"

# Edit referral_code to test the path you want:
#   - empty string  → no commission split (plain PaymentIntent)
#   - "AB-4LK0"     → known ready designer (commission split, 200)
#   - "AB-RPFG"     → designer without Stripe (engine falls back to plain, 200)
#   - "BAD-CODE"    → unknown (engine falls back to plain, 200)
$referralCode = ""

$body = @{
    amount_cents          = 24900
    coverage_retail_cents = 500000
    customer              = @{
        name  = "Jane Smoke"
        email = "smoke-$([Guid]::NewGuid().ToString().Substring(0,8))@example.com"
        phone = "+15551234567"
    }
    items_covered         = "iPhone 14 Pro + AirPods (smoke test)"
    consent_text          = "I agree to the terms (smoke test)"
}

if ($referralCode) {
    $body.referral_code = $referralCode
}

$bodyJson = $body | ConvertTo-Json -Compress

Write-Host "POST $bffUrl" -ForegroundColor Cyan
Write-Host "Body: $bodyJson" -ForegroundColor DarkGray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $bffUrl -Method POST -Body $bodyJson -ContentType "application/json"
    Write-Host "[OK] SUCCESS:" -ForegroundColor Green
    $response | ConvertTo-Json
}
catch {
    Write-Host "[FAIL] ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host "Body:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
    }
    elseif ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $bodyText = $reader.ReadToEnd()
            $reader.Close()
            if ($bodyText) {
                Write-Host "Body:" -ForegroundColor Yellow
                Write-Host $bodyText
            }
        } catch {
            Write-Host "(could not read response body)" -ForegroundColor DarkGray
        }
    }
}
