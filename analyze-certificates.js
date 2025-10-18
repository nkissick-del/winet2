#!/usr/bin/env node

// SSL Certificate Analyzer for WiNet Inverters
// This tool analyzes your inverter SSL certificates to determine what validation approach will work

const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');

// Your inverter IPs from .env
const INVERTER_IPS = ['192.168.1.114', '192.168.1.12'];

console.log('🔍 WiNet Inverter SSL Certificate Analyzer');
console.log('==========================================\n');

async function analyzeCertificate(ip) {
    console.log(`📡 Analyzing inverter: ${ip}`);
    console.log('----------------------------------------');

    return new Promise((resolve) => {
        // Test HTTPS connection with bypass (current method)
        const options = {
            hostname: ip,
            port: 443,
            path: '/i18n/en.properties',
            method: 'GET',
            rejectUnauthorized: false,
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            const cert = res.socket.getPeerCertificate(true);
            
            console.log('✅ HTTPS Connection: SUCCESS (with SSL bypass)');
            console.log(`📋 Certificate Analysis:`);
            console.log(`   Subject: ${JSON.stringify(cert.subject)}`);
            console.log(`   Issuer: ${JSON.stringify(cert.issuer)}`);
            console.log(`   Valid From: ${cert.valid_from}`);
            console.log(`   Valid To: ${cert.valid_to}`);
            console.log(`   Fingerprint (SHA256): ${cert.fingerprint256}`);
            console.log(`   Serial Number: ${cert.serialNumber}`);
            
            // Check if self-signed
            const isSelfSigned = JSON.stringify(cert.subject) === JSON.stringify(cert.issuer);
            console.log(`   Self-Signed: ${isSelfSigned ? '⚠️  YES' : '✅ NO'}`);
            
            // Check if expired
            const now = new Date();
            const validTo = new Date(cert.valid_to);
            const isExpired = now > validTo;
            console.log(`   Expired: ${isExpired ? '⚠️  YES' : '✅ NO'}`);
            
            // Check subject alternative names
            if (cert.subjectaltname) {
                console.log(`   Alt Names: ${cert.subjectaltname}`);
                const hasIP = cert.subjectaltname.includes(`IP:${ip}`);
                console.log(`   Includes IP ${ip}: ${hasIP ? '✅ YES' : '⚠️  NO'}`);
            } else {
                console.log(`   Alt Names: ⚠️  NONE`);
            }

            // Test strict validation
            testStrictValidation(ip).then((strictResult) => {
                // Test WebSocket connection
                testWebSocketConnection(ip).then((wsResult) => {
                    
                    const analysis = {
                        ip,
                        cert,
                        httpsWithBypass: true,
                        httpsStrict: strictResult,
                        webSocketBypass: wsResult.bypass,
                        webSocketStrict: wsResult.strict,
                        recommendations: generateRecommendations(cert, strictResult, wsResult)
                    };
                    
                    console.log(`\\n🎯 Recommendations for ${ip}:`);
                    analysis.recommendations.forEach(rec => console.log(`   ${rec}`));
                    console.log('\\n' + '='.repeat(50) + '\\n');
                    
                    resolve(analysis);
                });
            });
        });

        req.on('error', (e) => {
            console.log(`❌ HTTPS Connection: FAILED - ${e.message}`);
            resolve({ ip, error: e.message });
        });

        req.on('timeout', () => {
            console.log(`⏰ HTTPS Connection: TIMEOUT`);
            req.destroy();
            resolve({ ip, error: 'timeout' });
        });

        req.end();
    });
}

async function testStrictValidation(ip) {
    return new Promise((resolve) => {
        const options = {
            hostname: ip,
            port: 443,
            path: '/i18n/en.properties',
            method: 'GET',
            rejectUnauthorized: true,
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            console.log('✅ HTTPS Strict: SUCCESS (no SSL bypass needed!)');
            resolve(true);
        });

        req.on('error', (e) => {
            console.log(`❌ HTTPS Strict: FAILED - ${e.message}`);
            console.log('   ↳ This confirms SSL bypass is needed');
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`⏰ HTTPS Strict: TIMEOUT`);
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

async function testWebSocketConnection(ip) {
    return new Promise((resolve) => {
        let results = { bypass: false, strict: false };
        let testsCompleted = 0;

        // Test with bypass
        const ws1 = new WebSocket(`wss://${ip}:443/ws/home/overview`, {
            rejectUnauthorized: false
        });

        const ws1Timer = setTimeout(() => {
            ws1.terminate();
            console.log('⏰ WebSocket Bypass: TIMEOUT');
            testsCompleted++;
            if (testsCompleted === 2) resolve(results);
        }, 5000);

        ws1.on('open', () => {
            clearTimeout(ws1Timer);
            console.log('✅ WebSocket Bypass: SUCCESS');
            results.bypass = true;
            ws1.close();
            testsCompleted++;
            if (testsCompleted === 2) resolve(results);
        });

        ws1.on('error', (e) => {
            clearTimeout(ws1Timer);
            console.log(`❌ WebSocket Bypass: FAILED - ${e.message}`);
            testsCompleted++;
            if (testsCompleted === 2) resolve(results);
        });

        // Test with strict validation after delay
        setTimeout(() => {
            const ws2 = new WebSocket(`wss://${ip}:443/ws/home/overview`, {
                rejectUnauthorized: true
            });

            const ws2Timer = setTimeout(() => {
                ws2.terminate();
                console.log('⏰ WebSocket Strict: TIMEOUT');
                testsCompleted++;
                if (testsCompleted === 2) resolve(results);
            }, 5000);

            ws2.on('open', () => {
                clearTimeout(ws2Timer);
                console.log('✅ WebSocket Strict: SUCCESS');
                results.strict = true;
                ws2.close();
                testsCompleted++;
                if (testsCompleted === 2) resolve(results);
            });

            ws2.on('error', (e) => {
                clearTimeout(ws2Timer);
                console.log(`❌ WebSocket Strict: FAILED - ${e.message}`);
                testsCompleted++;
                if (testsCompleted === 2) resolve(results);
            });
        }, 2000);
    });
}

function generateRecommendations(cert, strictHTTPS, wsResults) {
    const recommendations = [];
    
    if (strictHTTPS && wsResults.strict) {
        recommendations.push('🎉 EXCELLENT: Enable strict SSL validation (rejectUnauthorized: true)');
        recommendations.push('🔒 HIGH SECURITY: This inverter has valid SSL certificates');
    } else if (cert && cert.fingerprint256) {
        recommendations.push('🔧 RECOMMENDED: Use certificate pinning');
        recommendations.push(`📌 Pin to: ${cert.fingerprint256}`);
        recommendations.push('🛡️  MEDIUM SECURITY: Validate against known certificate only');
    } else {
        recommendations.push('⚠️  CAUTION: SSL bypass required (current behavior)');
        recommendations.push('🔓 LOW SECURITY: Consider network-level security');
    }
    
    return recommendations;
}

async function generateConfiguration(analyses) {
    console.log('🛠️  CONFIGURATION RECOMMENDATIONS');
    console.log('=====================================\\n');
    
    const allCanUseStrict = analyses.every(a => a.httpsStrict && a.webSocketStrict);
    const allHaveCerts = analyses.every(a => a.cert && a.cert.fingerprint256);
    
    if (allCanUseStrict) {
        console.log('✅ ALL INVERTERS support strict SSL validation!');
        console.log('\\n# Add to your .env file:');
        console.log('SSL_VALIDATION=strict');
    } else if (allHaveCerts) {
        console.log('🔧 Certificate pinning recommended for security');
        console.log('\\n# Add to your .env file:');
        console.log('SSL_VALIDATION=pinned');
        analyses.forEach((analysis, index) => {
            if (analysis.cert) {
                console.log(`INVERTER_${index + 1}_CERT_FINGERPRINT=${analysis.cert.fingerprint256}`);
            }
        });
    } else {
        console.log('⚠️  SSL bypass required (current behavior)');
        console.log('\\n# Add to your .env file:');
        console.log('SSL_VALIDATION=bypass  # Current behavior');
    }
    
    console.log('\\n📝 Save certificate details to file...');
    const certData = {
        timestamp: new Date().toISOString(),
        inverters: analyses
    };
    
    fs.writeFileSync('inverter-certificates.json', JSON.stringify(certData, null, 2));
    console.log('✅ Certificate analysis saved to: inverter-certificates.json');
}

// Main execution
async function main() {
    try {
        const analyses = [];
        
        for (const ip of INVERTER_IPS) {
            const analysis = await analyzeCertificate(ip);
            analyses.push(analysis);
        }
        
        await generateConfiguration(analyses);
        
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
    }
}

// Check if WebSocket module is available
try {
    require.resolve('ws');
    main();
} catch (e) {
    console.log('❌ WebSocket module not found. Installing...');
    console.log('Run: npm install ws');
    console.log('Then run this script again.');
}