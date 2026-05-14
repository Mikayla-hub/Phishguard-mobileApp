"""
Advanced Feature Extraction for Phishing Detection
Extracts 30+ features from emails, URLs, and text content
"""

import re
from urllib.parse import urlparse
from datetime import datetime
import requests
from functools import lru_cache


def detect_typosquatting_url(hostname):
    """Detect typosquatting patterns in URL hostname"""
    if not hostname:
        return False
    
    parts = hostname.lower().split('.')
    # Get the apex domain (second-to-last label, before the TLD)
    # e.g., 'www.g00gle.com' -> 'g00gle', 'g00gle.com' -> 'g00gle'
    hostname_lower = parts[-2] if len(parts) >= 2 else parts[0]
    
    # Comprehensive brand dictionary with various typosquatting patterns
    brands = {
        'paypal': [
            'paypa1', 'paypa|', 'paypai', 'paypa-l', 'pay-pal', 'paypall', 
            'paypa', 'p4ypal', 'payp4l', 'paypàl', 'paypaI', 'p@ypal'
        ],
        'amazon': [
            'amaz0n', 'amazo', 'amzon', 'amazon-', 'amazn', 'am4z0n',
            'ama20n', 'am@zon', 'amazôn', 'amaz0'
        ],
        'google': [
            'g00gle', 'gogle', 'googlе', 'googl', 'g0ogle', 'gооgle',
            'go0gle', 'g@gle', 'goog1e'
        ],
        'apple': [
            'app1e', 'appl', 'appel', 'app|e', 'apples', 'app1',
            'a99le', 'àpple', 'app-le'
        ],
        'microsoft': [
            'micros0ft', 'microso', 'microsft', 'micro$oft', 'mkrcsoft',
            'microsoft-', 'm1cr050ft'
        ],
        'facebook': [
            'faceb00k', 'facebookk', 'facbk', 'face600k', 'f4ceb00k',
            'facebookl', 'facebook-'
        ],
        'instagram': [
            'instag ram', 'instagra', 'insta-gram', 'insta9ram', 'inst4gr4m'
        ],
        'linkedin': [
            'linkedln', 'linkdin', 'linkedin-', 'linkedin-com', 'linkedln-'
        ],
        'twitter': [
            'twitt', 'twitter-', 'twiter', 'tw1tter', 'twiтter'
        ],
        'ebay': [
            'ebay-', 'ebay1', 'eba7', 'ebay-com'
        ],
        'dropbox': [
            'dropbo', 'dropbox-', 'dropbo-x', 'dr0pbox'
        ],
        'github': [
            'githup', 'gitub', 'github-', 'gіthub'
        ],
        'stripe': [
            'stripe-', 'str1pe', 'strlpe'
        ],
        'coinbase': [
            'coinbase-', 'c01nbase'
        ],
        'twilio': [
            'twilio-', 'tw1lio'
        ]
    }
    
    # Check for brand typos
    for brand, typo_patterns in brands.items():
        for pattern in typo_patterns:
            if pattern in hostname_lower:
                return True
    
    # Check for character substitutions
    suspicious_chars = hostname_lower.replace('0', 'o').replace('1', 'l').replace('5', 's').replace('3', 'e')
    for brand in brands.keys():
        if brand in suspicious_chars and suspicious_chars != hostname_lower:
            return True
    
    return False


def enrich_url(url):
    """Append structural signal tokens to URL for TF-IDF feature extraction"""
    tokens = [url]
    try:
        p = urlparse(url if '://' in url else 'http://' + url)
        host = p.hostname or ''
        if re.match(r'^\d+\.\d+\.\d+\.\d+$', host):
            tokens.append('__FEAT_IP_ADDR__')
        if host.count('.') > 3:
            tokens.append('__FEAT_DEEP_SUBDOMAIN__')
        if '@' in url:
            tokens.append('__FEAT_AT_SYMBOL__')
        if len(url) > 100:
            tokens.append('__FEAT_LONG_URL__')
        if host.count('-') > 2:
            tokens.append('__FEAT_MANY_HYPHENS__')
        if len(re.findall(r'[=&]', url)) > 5:
            tokens.append('__FEAT_MANY_PARAMS__')
        if p.scheme == 'http' and any(k in url.lower() for k in ['login','account','verify','secure']):
            tokens.append('__FEAT_HTTP_SENSITIVE__')
        # Add typosquatting detection - HIGH PRIORITY
        if detect_typosquatting_url(host):
            tokens.append('__FEAT_TYPO__')
            tokens.append('__TYPO_BRAND__')  # Extra emphasis
    except Exception:
        pass
    return ' '.join(tokens)


class EmailFeatureExtractor:
    """Extract phishing indicators from email text, sender, subject"""
    
    # Actual urgency/pressure keywords (not just dates)
    URGENCY_KEYWORDS = [
        'urgent', 'immediate', 'act now', 'verify account', 'confirm identity',
        'click here', 'validate', 'expired', 'locked', 'suspended',
        'compromised', 'unusual activity', 'respond now', 'limited time'
    ]
    
    GENERIC_SENDERS = [
        'admin', 'support', 'info', 'help',
        'mailer-daemon'
    ]
    
    # Domains that are always trusted — never flag as suspicious
    TRUSTED_SENDER_DOMAINS = [
        'google.com', 'accounts.google.com', 'gmail.com',
        'microsoft.com', 'live.com', 'outlook.com', 'hotmail.com',
        'apple.com', 'icloud.com',
        'amazon.com', 'amazon.co.uk',
        'paypal.com',
        'netflix.com',
        'linkedin.com',
        'github.com',
        'twitter.com', 'x.com',
        'facebook.com', 'meta.com',
        'zoom.us',
        'dropbox.com',
        'spotify.com',
    ]
    
    SUSPICIOUS_DOMAINS = [
        'bit.ly', 'tinyurl.com', 'ow.ly', 'short.link', 'goo.gl',
        'rebrand.ly', 'pastebin', 'github.io', 'glitch.me',
        'herokuapp.com', 'ngrok.io'
    ]
    
    # Real financial/sensitive brands (actual targets of phishing)
    SENSITIVE_BRANDS = [
        'bank', 'paypal', 'amazon', 'apple', 'microsoft', 'dropbox',
        'stripe', 'twilio', 'github', 'coinbase', 'blockchain'
    ]
    
    @staticmethod
    def extract(email_text, sender='', subject=''):
        """Extract all email features - returns dict"""
        features = {}
        
        # Text normalization
        text_lower = email_text.lower()
        text_words = email_text.split()
        
        # ===== SENDER FEATURES =====
        sender_lower = sender.lower()
        sender_prefix = sender_lower.split('@')[0] if '@' in sender_lower else sender_lower
        sender_domain = sender_lower.split('@')[1] if '@' in sender_lower else ''
        
        # Check if sender domain is a trusted corporate domain — never flag these
        is_trusted_domain = any(
            sender_domain == td or sender_domain.endswith('.' + td)
            for td in EmailFeatureExtractor.TRUSTED_SENDER_DOMAINS
        )
        
        features['is_trusted_sender'] = is_trusted_domain
        features['sender_is_generic'] = (
            any(gen in sender_prefix for gen in EmailFeatureExtractor.GENERIC_SENDERS)
            and not is_trusted_domain
        )
        features['sender_has_numbers'] = bool(re.search(r'\d', sender_prefix)) and not is_trusted_domain
        features['sender_has_special_chars'] = bool(re.search(r'[+_.-]', sender_prefix))
        features['sender_suspicious_domain'] = (
            any(susp in sender_domain for susp in EmailFeatureExtractor.SUSPICIOUS_DOMAINS)
            and not is_trusted_domain
        )
        
        # ===== URL FEATURES =====
        urls = re.findall(r'http[s]?://[^\s\)"\]<>]+', email_text)
        features['url_count'] = len(urls)
        
        shortened_url_count = sum(1 for url in urls 
                                 if any(short in url for short in EmailFeatureExtractor.SUSPICIOUS_DOMAINS))
        features['shortened_url_count'] = shortened_url_count
        features['has_shortened_url'] = shortened_url_count > 0
        
        features['has_ip_url'] = bool(re.search(r'http[s]?://\d+\.\d+\.\d+\.\d+', email_text))
        
        # URL-to-text ratio (phishing emails have more URLs)
        features['url_to_word_ratio'] = len(urls) / max(1, len(text_words))
        
        # ===== CONTENT URGENCY FEATURES =====
        urgency_count = sum(1 for keyword in EmailFeatureExtractor.URGENCY_KEYWORDS
                           if re.search(r'\b' + keyword + r'\b', text_lower))
        features['urgency_word_count'] = urgency_count
        features['has_urgency'] = urgency_count > 0
        
        # ===== SUBJECT LINE FEATURES =====
        subject_lower = subject.lower()
        features['subject_has_urgency'] = any(
            kw in subject_lower for kw in EmailFeatureExtractor.URGENCY_KEYWORDS
        )
        features['subject_has_re_fwd'] = bool(re.search(r'^\s*(re|fwd):', subject_lower))
        features['subject_length'] = len(subject)
        
        # ===== CAPITALIZATION FEATURES =====
        capital_sequences = re.findall(r'[A-Z]{3,}', email_text)
        total_words = len(email_text.split())
        features['capital_sequence_ratio'] = len(capital_sequences) / max(1, total_words)
        features['excessive_caps'] = features['capital_sequence_ratio'] > 0.05
        
        # ===== FORMATTING FEATURES =====
        features['html_form_count'] = email_text.count('<form')
        features['html_input_count'] = email_text.count('<input')
        features['html_button_count'] = email_text.count('<button') + email_text.count('<a href')
        features['has_form'] = email_text.count('<form') > 0
        
        # ===== ATTACHMENT FEATURES =====
        suspicious_extensions = ['.zip', '.exe', '.scr', '.bat', '.cmd', '.vbs', '.jar']
        features['has_executable_mention'] = any(
            ext in text_lower for ext in suspicious_extensions
        )
        
        # ===== LINGUISTIC FEATURES =====
        # Grammar/language indicators
        features['has_broken_grammar'] = bool(re.search(
            r"(u\'re|ur\s|thier|recieve|wich|occured)", text_lower
        ))
        
        # Personal info requests
        personal_info_keywords = ['password', 'pin', 'cvv', 'ssn', 'credit card', 'bank account']
        features['requests_personal_info'] = sum(1 for kw in personal_info_keywords
                                                if kw in text_lower)
        
        # ===== PHISHING TACTICS =====
        features['uses_urgency_tactic'] = urgency_count > 2  # Require multiple urgency indicators
        
        # Authority impersonation: Only flag if sender domain doesn't match the brand mentioned
        # AND it's asking for credentials (real phishing tactic)
        mentioned_brand = None
        for brand in EmailFeatureExtractor.SENSITIVE_BRANDS:
            if brand in text_lower:
                mentioned_brand = brand
                break
        
        # Only flag as impersonation if:
        # 1. Sender doesn't match the brand domain, AND
        # 2. Email asks for credentials
        asks_for_credentials = bool(re.search(
            r'(verify|confirm|validate|enter).{0,30}(password|pin|credit card|account|identity)', text_lower
        ))
        
        if mentioned_brand and asks_for_credentials:
            # Check if sender domain contains the brand
            brand_match = mentioned_brand in sender_domain
            features['uses_authority_tactic'] = not brand_match  # Only flag if mismatch
        else:
            features['uses_authority_tactic'] = False  # Don't flag legitimate corporate emails
        
        # Social engineering is only when asking for data PLUS urgency
        features['uses_social_engineering'] = (
            asks_for_credentials and urgency_count > 0
        )
        
        # ===== COMPLEXITY FEATURES =====
        features['email_length'] = len(email_text)
        features['avg_word_length'] = sum(len(w) for w in text_words) / max(1, len(text_words))
        features['unique_word_ratio'] = len(set(text_words)) / max(1, len(text_words))
        
        # ===== SENDER-CONTENT MISMATCH =====
        features['sender_body_mismatch'] = not any(
            part in email_text.lower() for part in sender_prefix.lower().split('.')
        )
        
        return features


class URLFeatureExtractor:
    """Extract structural features from URLs"""
    
    @staticmethod
    def extract(url):
        """Extract URL structural features"""
        features = {}
        
        # Parse URL
        try:
            if not url.startswith('http://') and not url.startswith('https://'):
                url = 'http://' + url
            parsed = urlparse(url)
            hostname = parsed.hostname or ''
            scheme = parsed.scheme or 'http'
        except Exception as e:
            features['parse_error'] = True
            return features
        
        # ===== BASIC URL FEATURES =====
        features['url_length'] = len(url)
        features['long_url'] = len(url) > 100
        
        # ===== HOSTNAME FEATURES =====
        features['hostname_length'] = len(hostname)
        features['is_ip_address'] = bool(re.match(r'^\d+\.\d+\.\d+\.\d+$', hostname))
        
        # Subdomain depth
        subdomain_count = hostname.count('.')
        features['subdomain_depth'] = subdomain_count
        features['deep_subdomain'] = subdomain_count > 3
        features['suspicious_subdomain_depth'] = subdomain_count > 5
        
        # ===== CHARACTER ANALYSIS =====
        features['at_symbol_count'] = url.count('@')
        features['has_at_symbol'] = features['at_symbol_count'] > 0
        
        features['hyphen_count'] = hostname.count('-')
        features['many_hyphens'] = features['hyphen_count'] > 2
        
        # ===== PORT & PROTOCOL =====
        features['non_standard_port'] = parsed.port not in (None, 80, 443)
        features['uses_http'] = scheme == 'http'
        
        # ===== QUERY STRING FEATURES =====
        query_params = parsed.query.split('&') if parsed.query else []
        features['param_count'] = len(query_params)
        features['many_params'] = len(query_params) > 5
        
        # Suspicious parameter patterns
        sensitive_params = ['login', 'user', 'pass', 'email', 'account', 'verify', 'confirm']
        features['has_sensitive_params'] = any(
            param in parsed.query.lower() for param in sensitive_params
        )
        
        # ===== OBFUSCATION INDICATORS =====
        features['hex_encoding'] = '%' in url
        features['unicode_encoding'] = '\\u' in url or '&#' in url
        
        # ===== DOMAIN REPUTATION FLAGS =====
        features['new_tld'] = hostname.endswith(
            ('.tk', '.ml', '.ga', '.cf', '.gq', '.top', '.xyz', '.club')
        )
        
        # Enhanced typosquatting detection
        features['looks_like_typo'] = URLFeatureExtractor._detect_typosquatting(hostname)
        
        # ===== COMBINED FEATURES =====
        features['overall_suspicion_score'] = (
            int(features.get('is_ip_address', False)) * 3 +
            int(features.get('has_at_symbol', False)) * 3 +
            int(features.get('long_url', False)) * 2 +
            int(features.get('deep_subdomain', False)) * 2 +
            int(features.get('uses_http', False)) * 2 +
            int(features.get('many_hyphens', False)) * 1 +
            int(features.get('new_tld', False)) * 1 +
            int(features.get('looks_like_typo', False)) * 3
        )
        
        return features
    
    @staticmethod
    def _detect_typosquatting(hostname):
        """Detect typosquatting and common brand impersonation patterns"""
        parts = hostname.lower().split('.')
        # Get the apex domain (second-to-last label, before the TLD)
        # e.g., 'www.g00gle.com' -> 'g00gle', 'g00gle.com' -> 'g00gle'
        hostname_lower = parts[-2] if len(parts) >= 2 else parts[0]
        
        # Comprehensive brand dictionary with various typosquatting patterns
        brands = {
            # PayPal variations: numeric substitution (1 for l), visual similarity
            'paypal': [
                'paypa1', 'paypa|', 'paypai', 'paypa-l', 'pay-pal', 'paypall', 
                'paypa', 'p4ypal', 'payp4l', 'paypàl', 'paypaI', 'p@ypal'
            ],
            # Amazon variations
            'amazon': [
                'amaz0n', 'amazo', 'amzon', 'amazon-', 'amazn', 'am4z0n',
                'ama20n', 'am@zon', 'amazôn', 'amaz0'
            ],
            # Google variations
            'google': [
                'g00gle', 'gogle', 'googlе', 'googl', 'g0ogle', 'gооgle',
                'go0gle', 'g@gle', 'goog1e'
            ],
            # Apple variations
            'apple': [
                'app1e', 'appl', 'appel', 'app|e', 'apples', 'app1',
                'a99le', 'àpple', 'app-le'
            ],
            # Microsoft variations
            'microsoft': [
                'micros0ft', 'microso', 'microsft', 'micro$oft', 'mkrcsoft',
                'microsoft-', 'm1cr050ft'
            ],
            # Facebook variations
            'facebook': [
                'faceb00k', 'facebookk', 'facbk', 'face600k', 'f4ceb00k',
                'facebookl', 'facebook-'
            ],
            # Other major platforms
            'instagram': [
                'instag ram', 'instagra', 'insta-gram', 'insta9ram', 'inst4gr4m'
            ],
            'linkedin': [
                'linkedln', 'linkdin', 'linkedin-', 'linkedin-com', 'linkedln-'
            ],
            'twitter': [
                'twitt', 'twitter-', 'twiter', 'tw1tter', 'twiтter'
            ],
            'ebay': [
                'ebay-', 'ebay1', 'eba7', 'ebay-com'
            ],
            'dropbox': [
                'dropbo', 'dropbox-', 'dropbo-x', 'dr0pbox'
            ],
            'github': [
                'githup', 'gitub', 'github-', 'gіthub'
            ],
            'stripe': [
                'stripe-', 'str1pe', 'strlpe'
            ],
            'coinbase': [
                'coinbase-', 'c01nbase'
            ],
            'twilio': [
                'twilio-', 'tw1lio'
            ]
        }
        
        # Check for brand typos (case-insensitive)
        for brand, typo_patterns in brands.items():
            for pattern in typo_patterns:
                if pattern in hostname_lower:
                    return True
        
        # Check for character substitutions in domain name
        # Look for suspicious numeric/special char patterns near known brands
        suspicious_chars = hostname_lower.replace('0', 'o').replace('1', 'l').replace('5', 's').replace('3', 'e')
        for brand in brands.keys():
            if brand in suspicious_chars and suspicious_chars != hostname_lower:
                return True
        
        # Check for known phishing TLDs combined with brand-like names
        phishing_indicators = [
            r'bank.*login',
            r'paypal.*verify',
            r'amazon.*account',
            r'apple.*id',
            r'microsoft.*account',
            r'secure.*login',
            r'verify.*account'
        ]
        for pattern in phishing_indicators:
            if re.search(pattern, hostname_lower):
                return True
        
        return False


class URLReputationChecker:
    """Check URL reputation against external databases (with caching)"""
    
    @staticmethod
    @lru_cache(maxsize=1000)
    def check_url(url, timeout=3):
        """Check URL against URLhaus and PhishTank"""
        reputation = {}
        
        try:
            from urllib.parse import quote
            quoted_url = quote(url, safe='')
            
            # URLhaus API
            try:
                response = requests.get(
                    'https://urlhaus-api.abuse.ch/v1/url/',
                    params={'url': url},
                    timeout=timeout
                )
                if response.status_code == 200:
                    data = response.json()
                    reputation['urlhaus_status'] = data.get('query_status', 'not_found')
                    if data.get('query_status') == 'ok' and data.get('results'):
                        reputation['urlhaus_threat'] = data['results'][0].get('threat', 'unknown')
                        reputation['urlhaus_blacklisted'] = True
            except requests.exceptions.RequestException:
                pass
            
            # PhishTank API (requires API key, skip for now)
            reputation['checked'] = True
            
        except Exception as e:
            reputation['check_error'] = str(e)
        
        return reputation


class TextFeatureExtractor:
    """Extract features from generic text"""
    
    @staticmethod
    def extract(text):
        """Extract text-level features"""
        features = {}
        
        # Basic stats
        features['text_length'] = len(text)
        features['word_count'] = len(text.split())
        features['unique_words'] = len(set(text.lower().split()))
        features['avg_word_length'] = features['text_length'] / max(1, features['word_count'])
        
        # Linguistic patterns
        features['has_urls'] = bool(re.search(r'http[s]?://', text))
        features['url_count'] = len(re.findall(r'http[s]?://', text))
        
        # Urgency indicators
        urgency_words = ['urgent', 'immediately', 'now', 'asap', 'hurry', 'limited time']
        features['urgency_score'] = sum(1 for word in urgency_words if word in text.lower())
        
        # Numbers and special characters
        features['digit_ratio'] = len(re.findall(r'\d', text)) / max(1, len(text))
        features['special_char_ratio'] = len(re.findall(r'[!@#$%^&*]', text)) / max(1, len(text))
        
        return features


# Aggregate function for convenience
def extract_all_features(email_text='', sender='', subject='', url=''):
    """Extract all available features"""
    all_features = {}
    
    if email_text or sender or subject:
        all_features.update(EmailFeatureExtractor.extract(email_text, sender, subject))
    
    if url:
        all_features.update(URLFeatureExtractor.extract(url))
        # Try reputation check (non-blocking)
        try:
            reputation = URLReputationChecker.check_url(url)
            all_features.update(reputation)
        except:
            pass
    
    return all_features
