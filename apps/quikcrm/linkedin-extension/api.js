// API helper for authenticated requests
// Automatically attaches JWT token and handles 401 errors

// API base URL - QuikCRM Next.js app (runs on :3008 in local dev)
// Change this to your production URL when deploying
const API_BASE_URL = 'http://localhost:3008';

// UAT
// const API_BASE_URL = 'https://uatquiksocial.quikit.ai';

// Production
// const API_BASE_URL = 'https://quiksocial.quikit.ai';

// Storage keys
const STORAGE_KEY_TOKEN = 'authToken';

/**
 * Get stored auth token
 */
async function getAuthToken() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY_TOKEN]);
    return result[STORAGE_KEY_TOKEN] || null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Clear auth token (on logout or 401)
 */
async function clearAuthToken() {
  try {
    await chrome.storage.local.remove([STORAGE_KEY_TOKEN, 'userEmail']);
  } catch (error) {
    console.error('Error clearing auth token:', error);
  }
}

/**
 * Make authenticated API request
 * Automatically attaches Authorization header with JWT token
 * Handles 401 by clearing token and showing error
 * 
 * @param {string} endpoint - API endpoint (e.g., '/api/leads/from-linkedin')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Response>}
 */
async function apiFetch(endpoint, options = {}) {
  // Get token
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('Not authenticated. Please login from extension popup.');
  }
  
  // Build full URL
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  // Merge headers
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {}),
  };
  
  // Make request
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Clear token
      await clearAuthToken();
      
      // Show error message (if we're in the side panel context)
      if (typeof showToast === 'function') {
        showToast('Session expired. Please login again from extension popup.', 'error');
      }
      
      throw new Error('Authentication failed. Please login again.');
    }
    
    return response;
  } catch (error) {
    // Re-throw with more context if it's a network error
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Network error. Please check your connection and try again.');
    }
    throw error;
  }
}

// Export for use in other files (browser global scope)
if (typeof window !== 'undefined') {
  window.API_BASE_URL = API_BASE_URL;
  window.apiFetch = apiFetch;
  window.getAuthToken = getAuthToken;
  window.clearAuthToken = clearAuthToken;
}

// Also export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { apiFetch, getAuthToken, clearAuthToken };
}
