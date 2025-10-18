#!/bin/bash

# Quick SSL Certificate Extraction for WiNet Inverters
# No Node.js required - uses standard command line tools

echo "🔍 Quick SSL Certificate Analysis"
echo "================================="

# Read inverter IPs from .env file
INVERTER_IPS=$(grep "WINET_HOSTS" .env 2>/dev/null | cut -d= -f2 | tr ',' ' ')

if [ -z "$INVERTER_IPS" ]; then
    # Fallback to single host
    INVERTER_IPS=$(grep "WINET_HOST" .env 2>/dev/null | cut -d= -f2)
fi

if [ -z "$INVERTER_IPS" ]; then
    echo "❌ No inverter IPs found in .env file"
    echo "Please check your WINET_HOST or WINET_HOSTS configuration"
    exit 1
fi

echo "📡 Found inverters: $INVERTER_IPS"
echo ""

for IP in $INVERTER_IPS; do
    echo "🔍 Analyzing: $IP"
    echo "------------------------"
    
    # Check if port 443 is open
    if timeout 5 bash -c "</dev/tcp/$IP/443" 2>/dev/null; then
        echo "✅ Port 443: OPEN"
        
        # Extract certificate details
        echo "📋 Certificate details:"
        
        # Get certificate info
        CERT_INFO=$(echo | timeout 10 openssl s_client -connect $IP:443 -servername $IP 2>/dev/null)
        
        if [ $? -eq 0 ] && [ -n "$CERT_INFO" ]; then
            # Extract key information
            echo "$CERT_INFO" | openssl x509 -noout -text 2>/dev/null | grep -A1 "Subject:"
            echo "$CERT_INFO" | openssl x509 -noout -text 2>/dev/null | grep -A1 "Issuer:"
            echo "$CERT_INFO" | openssl x509 -noout -dates 2>/dev/null
            
            # Get fingerprint
            FINGERPRINT=$(echo "$CERT_INFO" | openssl x509 -noout -fingerprint -sha256 2>/dev/null)
            echo "$FINGERPRINT"
            
            # Check if self-signed
            SUBJECT=$(echo "$CERT_INFO" | openssl x509 -noout -subject 2>/dev/null)
            ISSUER=$(echo "$CERT_INFO" | openssl x509 -noout -issuer 2>/dev/null)
            
            if [ "$SUBJECT" = "$ISSUER" ]; then
                echo "⚠️  Certificate: SELF-SIGNED"
            else
                echo "✅ Certificate: CA-SIGNED"
            fi
            
            # Test strict SSL validation
            echo ""
            echo "🔒 Testing strict SSL validation..."
            
            if timeout 5 openssl s_client -connect $IP:443 -verify_return_error -servername $IP </dev/null >/dev/null 2>&1; then
                echo "✅ Strict validation: SUCCESS"
                echo "   ↳ This inverter can use rejectUnauthorized: true"
            else
                echo "❌ Strict validation: FAILED"
                echo "   ↳ SSL bypass is required for this inverter"
            fi
            
        else
            echo "❌ Could not retrieve certificate"
        fi
        
    else
        echo "❌ Port 443: CLOSED or TIMEOUT"
        echo "   ↳ Inverter may not support SSL"
    fi
    
    echo ""
    echo "=" x 50
    echo ""
done

echo "💡 SUMMARY RECOMMENDATIONS:"
echo ""

# Test with curl if available
if command -v curl >/dev/null 2>&1; then
    echo "🧪 Testing with curl..."
    for IP in $INVERTER_IPS; do
        echo "Testing $IP..."
        
        # Test with SSL verification
        if curl -s --max-time 5 "https://$IP/i18n/en.properties" >/dev/null 2>&1; then
            echo "✅ $IP: curl with SSL verification works"
        else
            echo "❌ $IP: curl with SSL verification fails"
        fi
        
        # Test without SSL verification
        if curl -s -k --max-time 5 "https://$IP/i18n/en.properties" >/dev/null 2>&1; then
            echo "✅ $IP: curl with -k (bypass) works"
        else
            echo "❌ $IP: even curl -k fails"
        fi
    done
fi

echo ""
echo "📝 Next steps:"
echo "1. If all inverters pass strict validation: enable rejectUnauthorized: true"
echo "2. If some fail: implement certificate pinning"  
echo "3. If all fail: keep current SSL bypass but consider network security"
echo ""
echo "For detailed analysis, run: node analyze-certificates.js"