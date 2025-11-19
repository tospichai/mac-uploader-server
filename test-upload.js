import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

// Create a simple test image (1x1 pixel PNG)
const testImageBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

// Create form data for upload
const form = new FormData();
form.append('original_file', testImageBuffer, {
  filename: 'test.jpg',
  contentType: 'image/jpeg'
});
form.append('original_name', 'Test Photo');
form.append('local_path', '/test/path');
form.append('shot_at', new Date().toISOString());
form.append('api_key', 'jappy'); // Make sure this matches your EXPECTED_API_KEY

// Send upload request
async function testUpload() {
  try {
    console.log('Testing photo upload...');

    const response = await fetch('http://localhost:3001/api/events/test-event/photos?api_key=jappy', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const result = await response.json();
    console.log('Upload response:', result);

    if (result.success) {
      console.log('✅ Photo uploaded successfully!');
      console.log('Photo ID:', result.photo_id);
      console.log('Check the browser to see if the photo appears automatically!');
    } else {
      console.error('❌ Upload failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Error during upload:', error);
  }
}

testUpload();