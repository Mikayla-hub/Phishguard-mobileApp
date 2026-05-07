# CRITICAL BUG FIX: URL Label Inversion

## Summary

**The system bias was caused by reversed URL dataset labels!**

### Root Cause
The URL dataset CSV has labels in reverse order compared to our training expectations:
- **CSV labels**: `0` = Phishing, `1` = Legitimate  
- **Our model expects**: `0` = Legitimate, `1` = Phishing

This caused google.com (label 1 in CSV = legitimate) to be predicted as class 1, which the code interpreted as phishing → **99% score**.

### The Fix

**File**: [ml_train_ensemble.py](ml_train_ensemble.py#L108-L122)

**Original code (BROKEN)**:
```python
def load_url_dataset():
    ...
    labels.append(int(label))  # 0=phishing, 1=legitimate from CSV
```

**Fixed code**:
```python
def load_url_dataset():
    ...
    # CSV has 0=phishing, 1=legitimate but our model expects 0=legitimate, 1=phishing
    # So we invert: CSV 0 → 1 (phishing), CSV 1 → 0 (legitimate)
    labels.append(1 if label == "0" else 0)
```

### Status

✅ **Fixed in code** - [ml_train_ensemble.py](ml_train_ensemble.py) has been updated  
⏳ **Pending** - Models need to be retrained with corrected labels

### How to Apply the Fix

#### Option 1: Retrain Models (Recommended)
```bash
cd backend
python ml_train_ensemble.py
```

This will:
1. Load URL dataset with inverted labels (0→1, 1→0)
2. Train ensemble with correct label scheme
3. Save corrected models
4. google.com will now score as ~5% phishing (legitimate)
5. Phishing URLs will score correctly as 85%+

Training takes 3-5 minutes. Models are automatically reloaded when the ML server restarts.

#### Option 2: Quick Test (Before Retraining)
```bash
python test_refined_scoring.py
```

This tests the system with sample emails and URLs.

### Expected Improvements After Fix

| URL | Before (Broken) | After (Fixed) | Status |
|-----|---|---|---|
| google.com | 99% phishing ❌ | <5% phishing ✅ |
| uni-mainz.de | 99% phishing ❌ | <5% phishing ✅ |
| amazon.com | 99% phishing ❌ | <5% phishing ✅ |
| paypa1.com (typo) | <5% phishing ❌ | 95% phishing ✅ |
| f0519141.xsph.ru | <5% phishing ❌ | 95% phishing ✅ |

### Technical Details

**Why This Happened**:
- Email dataset has labels encoded as: "phishing" → 1, else → 0
- URL dataset had CSV with: 0 = phishing (negative class), 1 = legitimate (positive class)  
- Code directly used `int(label)` without normalizing to our scheme
- sklearn's `predict_proba()` returns [class_0_prob, class_1_prob]
- If class 0 = phishing, then legitimate URLs get class 1 → mistaken for phishing

**Label Schema After Fix**:
```
Both datasets now use:
  0 = Legitimate
  1 = Phishing

model.predict_proba(X)[0] = probability of legitimate
model.predict_proba(X)[1] = probability of phishing ✓
```

### Verification Checklist

After retraining, verify:
- [ ] google.com scores < 10% phishing
- [ ] amazon.com scores < 10% phishing
- [ ] Phishing URLs score > 80% phishing
- [ ] ML server responds with correct confidence scores
- [ ] Risk indicators match the phishing probability

### References

- **Dataset Documentation**: [ML_SETUP_GUIDE.md](ML_SETUP_GUIDE.md)
- **Training Script**: [ml_train_ensemble.py](ml_train_ensemble.py#L108-L122)
- **ML Server**: [ml_server_enhanced.py](ml_server_enhanced.py#L260-L285)

### Next Steps

1. **Kill the current training** if still running (press Ctrl+C)
2. **Run training again** with the fixed code:
   ```bash
   python ml_train_ensemble.py
   ```
3. **Restart Flask server** once training completes:
   ```bash
   python ml_server_enhanced.py
   ```
4. **Test the fix**: Go back to testing google.com - should now score < 10%

---

**Committed**: Fix applied to ml_train_ensemble.py  
**Status**: Ready for retraining
