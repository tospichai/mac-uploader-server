// Function declarations first (hoisted)
function openModal(imageSrc) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  modal.classList.add('active');
  modalImg.src = imageSrc;
}

function closeModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('active');
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-x-full';

  // Set color based on type
  switch(type) {
    case 'success':
      notification.classList.add('bg-green-500', 'text-white');
      break;
    case 'error':
      notification.classList.add('bg-red-500', 'text-white');
      break;
    case 'warning':
      notification.classList.add('bg-yellow-500', 'text-white');
      break;
    default:
      notification.classList.add('bg-blue-500', 'text-white');
  }

  notification.textContent = message;
  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
    notification.classList.add('translate-x-0');
  }, 100);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('translate-x-0');
    notification.classList.add('translate-x-full');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

async function downloadPhoto(downloadUrl, photoId) {
  try {
    const res = await fetch(downloadUrl);
    const data = await res.json();

    if (data.success && data.base64) {
      // สร้าง link สำหรับดาวน์โหลดจาก base64
      const link = document.createElement('a');
      link.href = data.base64;
      link.download = 'photo_' + photoId + '.jpg';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      throw new Error('Invalid response from server');
    }

  } catch (e) {
    console.error("Download error:", e);
    alert("ไม่สามารถดาวน์โหลดไฟล์ได้");
  }
}

// SSE connection for real-time updates
let eventSource = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000; // 3 seconds

function connectSSE() {
  // Get event code from current URL
  const pathParts = window.location.pathname.split('/');
  const eventCode = pathParts[1]; // Assuming URL structure: /{eventCode}/photos

  if (!eventCode) {
    console.error('Could not determine event code from URL');
    return;
  }

  const streamUrl = '/' + eventCode + '/photos/stream';

  console.log('Connecting to SSE stream:', streamUrl);

  eventSource = new EventSource(streamUrl);

  eventSource.onopen = function(event) {
    console.log('SSE connection opened');
    reconnectAttempts = 0;
    showNotification('เชื่อมต่อแบบเรียลไทม์แล้ว', 'success');
  };

  eventSource.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('SSE message received:', data);

      if (data.type === 'photo_update') {
        handleNewPhoto(data.photo);
      } else if (data.type === 'heartbeat') {
        console.log('SSE heartbeat received');
      } else if (data.type === 'connected') {
        console.log('SSE connection confirmed for event:', data.eventCode);
      }
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };

  eventSource.onerror = function(event) {
    console.error('SSE connection error:', event);
    eventSource.close();

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      console.log('Attempting to reconnect (' + reconnectAttempts + '/' + maxReconnectAttempts + ')...');
      showNotification('พยายามเชื่อมต่อใหม่... (' + reconnectAttempts + '/' + maxReconnectAttempts + ')', 'warning');
      setTimeout(connectSSE, reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
      showNotification('ไม่สามารถเชื่อมต่อแบบเรียลไทม์ได้ กรุณารีเฟรชหน้า', 'error');
    }
  };
}

function handleNewPhoto(photoData) {
  console.log('New photo received:', photoData);

  // Create the photo element directly as a DOM node (not as HTML string)
  const photoElement = createPhotoElementDOM(photoData);

  // Add to the beginning of the photo grid
  const photoGrid = document.querySelector('.photo-grid');
  if (photoGrid) {
    photoGrid.insertBefore(photoElement, photoGrid.firstChild);

    // Update total photos count
    const totalPhotosElement = document.querySelector('p:has(span.font-semibold)');
    if (totalPhotosElement) {
      const textContent = totalPhotosElement.textContent || totalPhotosElement.innerText;
      const match = textContent.match(/Total:\s*(\d+)\s*photos?/);
      if (match && match[1]) {
        const currentTotal = parseInt(match[1]);
        const eventCodeSpan = totalPhotosElement.querySelector('span.font-semibold');
        const eventCode = eventCodeSpan ? eventCodeSpan.textContent : 'Unknown';
        totalPhotosElement.innerHTML = 'Total: <span class="font-semibold">' + eventCode + '</span><br>Total: ' + (currentTotal + 1) + ' photos';
      } else {
        // If regex doesn't match, try to find the number in a different way
        const numbers = textContent.match(/\d+/);
        if (numbers && numbers[0]) {
          const currentTotal = parseInt(numbers[0]);
          const eventCodeSpan = totalPhotosElement.querySelector('span.font-semibold');
          const eventCode = eventCodeSpan ? eventCodeSpan.textContent : 'Unknown';
          totalPhotosElement.innerHTML = 'Total: <span class="font-semibold">' + eventCode + '</span><br>Total: ' + (currentTotal + 1) + ' photos';
        } else {
          // Fallback: just add a new count
          const eventCodeSpan = totalPhotosElement.querySelector('span.font-semibold');
          const eventCode = eventCodeSpan ? eventCodeSpan.textContent : 'Unknown';
          totalPhotosElement.innerHTML = 'Total: <span class="font-semibold">' + eventCode + '</span><br>Total: 1 photos';
        }
      }
    }

    // Show notification
    showNotification('มีรูปใหม่!', 'success');

    // Highlight the new photo
    photoElement.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-75');
    setTimeout(() => {
      photoElement.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-75');
    }, 3000);
  }
}

function createPhotoElementDOM(photoData) {
  // This function is used for dynamically added photos via SSE
  // It returns a DOM element with proper event listeners
  const imageUrl = photoData.displayUrl || photoData.downloadUrl;
  const photoId = photoData.photoId;
  const lastModified = photoData.lastModified ? new Date(photoData.lastModified).toLocaleString('th-TH') : '';
  const downloadUrl = photoData.downloadUrl;

  // Get event code from current URL
  const pathParts = window.location.pathname.split('/');
  const eventCode = pathParts[1] || 'unknown';

  // Create a container element
  const photoDiv = document.createElement('div');
  photoDiv.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300';

  // Create the image container
  const imageContainer = document.createElement('div');
  imageContainer.className = 'aspect-square relative group cursor-pointer m-2 border rounded-lg overflow-hidden';
  imageContainer.addEventListener('click', function() {
    openModal(imageUrl);
  });

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Photo ' + photoId;
    img.className = 'w-full h-full object-cover';
    img.loading = 'lazy';

    // Create hover overlay
    const hoverOverlay = document.createElement('div');
    hoverOverlay.className = 'absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center pointer-events-none';

    const eyeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    eyeIcon.setAttribute('class', 'w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300');
    eyeIcon.setAttribute('fill', 'none');
    eyeIcon.setAttribute('stroke', 'currentColor');
    eyeIcon.setAttribute('viewBox', '0 0 24 24');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('stroke-linecap', 'round');
    path1.setAttribute('stroke-linejoin', 'round');
    path1.setAttribute('stroke-width', '2');
    path1.setAttribute('d', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z');

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('stroke-linecap', 'round');
    path2.setAttribute('stroke-linejoin', 'round');
    path2.setAttribute('stroke-width', '2');
    path2.setAttribute('d', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z');

    eyeIcon.appendChild(path1);
    eyeIcon.appendChild(path2);
    hoverOverlay.appendChild(eyeIcon);

    imageContainer.appendChild(img);
    imageContainer.appendChild(hoverOverlay);
  } else {
    const noImageDiv = document.createElement('div');
    noImageDiv.className = 'w-full h-full bg-gray-200 flex items-center justify-center';
    const noImageSpan = document.createElement('span');
    noImageSpan.className = 'text-gray-500';
    noImageSpan.textContent = 'No image';
    noImageDiv.appendChild(noImageSpan);
    imageContainer.appendChild(noImageDiv);
  }

  // Create the info container
  const infoContainer = document.createElement('div');
  infoContainer.className = 'p-3 flex justify-between items-center';

  const textInfo = document.createElement('div');
  textInfo.className = 'min-w-0 flex-1 mr-2';

  const idPara = document.createElement('p');
  idPara.className = 'text-xs text-gray-500 truncate';
  idPara.title = 'ID: ' + photoId;
  idPara.textContent = 'ID: ' + photoId;

  const datePara = document.createElement('p');
  datePara.className = 'text-xs text-gray-400 truncate';
  datePara.title = lastModified;
  datePara.textContent = lastModified;

  textInfo.appendChild(idPara);
  textInfo.appendChild(datePara);

  infoContainer.appendChild(textInfo);

  if (downloadUrl) {
    const downloadButton = document.createElement('button');
    downloadButton.className = 'flex-shrink-0 text-black px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors duration-200 flex items-center';
    downloadButton.addEventListener('click', function() {
      downloadPhoto('/' + eventCode + '/photos/' + photoId, photoId);
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'w-5 h-5 mr-1');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4');

    svg.appendChild(path);
    downloadButton.appendChild(svg);
    infoContainer.appendChild(downloadButton);
  }

  photoDiv.appendChild(imageContainer);
  photoDiv.appendChild(infoContainer);

  return photoDiv;
}

// Initialize SSE connection when page loads
document.addEventListener('DOMContentLoaded', function() {
  connectSSE();

  // Set up modal event listeners
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.addEventListener('click', function(event) {
      if (event.target === this) {
        closeModal();
      }
    });
  }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    closeModal();
  }
});

// Cleanup SSE connection when page unloads
window.addEventListener('beforeunload', function() {
  if (eventSource) {
    eventSource.close();
  }
});