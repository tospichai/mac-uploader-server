import { EventSource } from 'eventsource';

console.log('Testing SSE connection...');

// Connect to the SSE stream
const eventSource = new EventSource('http://localhost:3001/test-event/photos/stream');

eventSource.onopen = function(event) {
  console.log('✅ SSE connection opened');
};

eventSource.onmessage = function(event) {
  try {
    const data = JSON.parse(event.data);
    console.log('📨 SSE message received:', data);

    if (data.type === 'photo_update') {
      console.log('🖼️ New photo detected!', data.photo.photoId);
    } else if (data.type === 'heartbeat') {
      console.log('💓 Heartbeat received');
    } else if (data.type === 'connected') {
      console.log('🔗 Connection confirmed for event:', data.eventCode);
    }
  } catch (error) {
    console.error('❌ Error parsing SSE message:', error);
  }
};

eventSource.onerror = function(event) {
  console.error('❌ SSE connection error:', event);
  eventSource.close();
};

// Keep the script running
console.log('Listening for SSE events... (Press Ctrl+C to stop)');

// Test upload after 2 seconds
setTimeout(() => {
  console.log('\n🚀 Triggering test upload to see SSE in action...');
  import('./test-upload.js');
}, 2000);