# Phishing Detection Bias Fixes

## Problem Identified

The original phishing detection system was over-flagging legitimate emails with biased scoring. Example: A genuine Google Cloud email about API updates was scored as 26% phishing risk due to:

- ❌ Over-sensitive urgency detection (treating any date mention as urgency tactic)
- ❌ Over-aggressive authority detection (any mention of a real company flagged as impersonation)
- ❌ Inflated risk indicators for legitimate features

## Solutions Implemented

### 1. **Urgency Detection Threshold Increase** ✅
**File**: `ml_feature_extractor.py`

**Before**:
```python
features['uses_urgency_tactic'] = urgency_count > 1  # Too aggressive
```

**After**:
```python
features['uses_urgency_tactic'] = urgency_count > 2  # Now requires 2+ keywords
```

**Impact**: 
- Prevents false positives on emails mentioning dates, announcements, or product updates
- Requires legitimate urgency language (not just mentioning "January" as a date)
- Example: "Update on January 15" → Not flagged ✓
- Example: "Act now!", "Verify immediately!", "Confirm urgently!" → Flagged (3 keywords) ✓

### 2. **Authority Detection Multi-Factor Check** ✅
**File**: `ml_feature_extractor.py`

**Before**:
```python
features['uses_authority_tactic'] = bool(re.search(r'\b(bank|paypal|amazon)\b', text_lower))
# Any mention of real company = flagged as impersonation
```

**After**:
```python
features['uses_authority_tactic'] = (
    bool(re.search(r'\b(bank|paypal|amazon)\b', text_lower)) and
    features.get('urgency_word_count', 0) > 1 and
    features.get('requests_personal_info', 0) > 0
)
# Now requires: brand mention + urgency + credential request
```

**Impact**:
- Distinguishes legitimate company communications from impersonation attempts
- Example: "Amazon shipped your package" → NOT flagged ✓ (no urgency, no credential request)
- Example: "ACT NOW! Verify Amazon account! Send password!" → Flagged ✓ (all 3 factors)

### 3. **Risk Indicator Refinement** ✅
**File**: `ml_server_enhanced.py`

**Changes**:
- **IP-based URLs**: CRITICAL (strong phishing signal, unchanged)
- **Multiple credential requests**: HIGH (only if >2 requests, not just 1)
- **Authority impersonation**: MEDIUM (now requires multi-factor check above)
- **Urgency pressure**: LOW (informational, less aggressive)
- **Generic sender**: Only shown if ALSO requesting personal info

**Impact**:
- Legitimate emails with 1 credential request (e.g., "confirm your email") no longer heavily penalized
- Only the most relevant and accurate risk factors are shown

## Expected Improvements

| Scenario | Before | After | Status |
|----------|--------|-------|--------|
| Google Cloud API update email | 26% phishing | <10% phishing | ✅ Expecting fix |
| Amazon shipping notification | Unknown | <10% phishing | ✅ Should not flag |
| Classic phishing (paypal typo) | Should be high | >85% phishing | ✅ Should improve |
| Tax refund scam | Should be high | >80% phishing | ✅ Should improve |

## Testing

Run the test script to validate improvements:

```bash
# In backend directory
python test_refined_scoring.py
```

This tests:
- ✓ 2 legitimate emails (should score <20%)
- ✓ 2 phishing emails (should score >70%)
- ✓ 1 brand-mention legitimate email (should score <15%)

## Validation Checklist

- [ ] Legitimate corporate emails score <20%
- [ ] Phishing emails score >70%
- [ ] No false positives on date mentions
- [ ] No false positives on brand names (from legitimate company)
- [ ] Risk indicators are accurate and not biased

## Next Steps

1. **Run the test script** to validate bias fixes
2. **Test with your own emails** - Run `/api/analyze/email` with samples
3. **Replace dataset** - When ready with better phishing data
4. **Retrain models** - `python ml_train_ensemble.py` with new data

## How to Test Manually

```bash
# Start ML server (if not already running)
cd backend
python ml_server_enhanced.py
```

```bash
# In another terminal, test an email
curl -X POST http://localhost:5000/api/analyze/email \
  -H "Content-Type: application/json" \
  -d '{"text": "Your account needs verification at https://amazon.com - Click here!"}'
```

Expected response:
```json
{
  "is_phishing": true,
  "phishing_confidence": 0.82,
  "top_risks": [
    {
      "severity": "HIGH",
      "indicator": "Requests sensitive information",
      "description": "Email asks for sensitive details"
    }
  ]
}
```

## Technical Details

The bias fixes address three key machine learning issues:

1. **Feature Engineering Bias**: Thresholds were set too low (>1 instead of >2)
2. **Context Insensitivity**: Features didn't consider relationship between indicators
3. **False Positive Rate**: Too many weak signals triggering flags

The fixes implement **contextual feature detection** - each flag now requires supporting evidence rather than standing alone.
