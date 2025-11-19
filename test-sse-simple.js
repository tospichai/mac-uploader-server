import http from 'http';

console.log('Testing SSE endpoint directly...');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/test-event/photos/stream',
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  if (res.statusCode === 200) {
    console.log('✅ SSE connection successful!');

    res.on('data', (chunk) => {
      console.log('📨 Received data:', chunk.toString());
    });

    res.on('end', () => {
      console.log('Connection ended');
    });

    // Test upload after 2 seconds
    setTimeout(() => {
      console.log('\n🚀 Triggering test upload...');
      import('./test-upload.js');
    }, 2000);

  } else {
    console.log('❌ SSE connection failed with status:', res.statusCode);
  }
});

req.on('error', (e) => {
  console.error(`❌ Request error: ${e.message}`);
});

req.end();