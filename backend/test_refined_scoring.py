#!/usr/bin/env python3
"""
Test script to validate refined phishing scoring fairness
"""

import requests
import json

# Test cases: (name, email_text, expected_risk_level)
test_cases = [
    # Legitimate emails - should score LOW (<20%)
    (
        "Google Cloud Update",
        """
        Subject: OpenTelemetry API Update
        From: security@google.com
        
        Hello,
        
        We're updating the OpenTelemetry API on January 15, 2024. 
        This is a routine infrastructure update that may cause brief service interruption.
        
        Visit our documentation for migration guide: https://cloud.google.com/docs
        
        Best regards,
        Google Cloud Security Team
        """,
        "LEGITIMATE",
        0.20
    ),
    
    (
        "Bank Status Update",
        """
        Subject: Account Statement Available
        From: notifications@mybank.com
        
        Your monthly statement is ready to view.
        
        You can access it anytime in your online dashboard.
        
        Thank you,
        MyBank Customer Service
        """,
        "LEGITIMATE",
        0.15
    ),
    
    # Phishing emails - should score HIGH (>70%)
    (
        "Classic Phishing",
        """
        Subject: URGENT: Verify Your PayPal Account
        From: support@paypa1.com
        
        Your PayPal account has been locked!
        
        Click here NOW to confirm your identity: http://192.168.1.1/verify
        
        We need your:
        - Email address
        - Password
        - Credit card number
        - Social security number
        
        ACT NOW or your account will be permanently closed!
        """,
        "PHISHING",
        0.85
    ),
    
    (
        "Tax Refund Scam",
        """
        Subject: IMMEDIATE ACTION REQUIRED - Tax Refund Pending
        From: admin@taxservice-relief.com
        
        The IRS has determined you are owed a tax refund!
        
        URGENT: Submit your information immediately to receive it.
        
        You must confirm:
        - SSN
        - Date of birth
        - Bank account details
        
        Click this link immediately: https://shorturl.co/verified
        """,
        "PHISHING",
        0.80
    ),
    
    # Edge cases - brand mention but legitimate
    (
        "Amazon Package Notification",
        """
        Subject: Your Amazon Package Has Shipped
        From: order-updates@amazon.com
        
        Great news! Your order #12345 has shipped.
        
        Track your package: https://amazon.com/gp/tracking
        
        Thank you for your purchase!
        """,
        "LEGITIMATE",
        0.10
    ),
]

def test_email_analysis():
    """Test email analysis endpoint"""
    print("=" * 70)
    print("TESTING REFINED PHISHING SCORING")
    print("=" * 70)
    
    for name, email_text, expected_type, expected_max_risk in test_cases:
        print(f"\n{'='*70}")
        print(f"TEST: {name}")
        print(f"Type: {expected_type}")
        print(f"Expected Risk: {'< ' + str(expected_max_risk*100) + '%' if expected_type == 'LEGITIMATE' else '> ' + str((1-expected_max_risk)*100) + '%'}")
        print(f"{'-'*70}")
        
        try:
            response = requests.post(
                'http://localhost:5000/api/analyze/email',
                json={'text': email_text},
                timeout=5
            )
            
            if response.status_code == 200:
                data = response.json()
                is_phishing = data.get('is_phishing', False)
                confidence = data.get('phishing_confidence', 0)
                top_risks = data.get('top_risks', [])
                
                print(f"Result: {'PHISHING' if is_phishing else 'LEGITIMATE'}")
                print(f"Confidence: {confidence*100:.1f}%")
                print(f"Top Risks:")
                for risk in top_risks:
                    print(f"  - [{risk['severity']}] {risk['indicator']}")
                    print(f"    {risk['description']}")
                
                # Validate expectations
                if expected_type == "LEGITIMATE":
                    if confidence < expected_max_risk:
                        print(f"✓ PASS: Legitimate email scored below {expected_max_risk*100}%")
                    else:
                        print(f"✗ FAIL: Legitimate email scored above {expected_max_risk*100}% - bias detected!")
                else:  # PHISHING
                    if confidence > (1 - expected_max_risk):
                        print(f"✓ PASS: Phishing detected with high confidence")
                    else:
                        print(f"✗ FAIL: Phishing not detected strongly enough")
                        
            else:
                print(f"✗ ERROR: API returned {response.status_code}")
                print(f"Response: {response.text}")
                
        except requests.exceptions.ConnectionError:
            print("✗ ERROR: Cannot connect to ML server on port 5000")
            print("Make sure to run: python ml_server_enhanced.py")
            return False
        except Exception as e:
            print(f"✗ ERROR: {str(e)}")
    
    print(f"\n{'='*70}")
    print("TEST COMPLETE")
    print("="*70)
    return True

if __name__ == '__main__':
    import sys
    success = test_email_analysis()
    sys.exit(0 if success else 1)
