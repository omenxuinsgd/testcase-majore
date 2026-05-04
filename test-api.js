// test-api.js - Jalankan dengan Node.js
const https = require('https');

// Disable SSL verification untuk localhost
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testRegistration() {
    const data = new URLSearchParams({
        userId: '0011',
        Name: 'Test User 11',
        Address: 'Jakarta'
    });

    const data2 = new URLSearchParams({
        userId: '0010',
        Name: 'Test User 10',
        Address: 'Jakarta'
    });
    
    const options = {
        hostname: 'localhost',
        port: 7180,
        path: '/api/face/registration',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    };
    
    console.log('Testing first registration...');
    const req1 = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log('First registration response:', res.statusCode, body);
            
            // Test second registration with same userId
            console.log('\nTesting second registration (update)...');
            const req2 = https.request(options, (res2) => {
                let body2 = '';
                res2.on('data', chunk => body2 += chunk);
                res2.on('end', () => {
                    console.log('Second registration response:', res2.statusCode, body2);
                });
            });
            req2.write(data2.toString());
            req2.end();
        });
    });
    req1.write(data.toString());
    req1.end();
}

testRegistration();