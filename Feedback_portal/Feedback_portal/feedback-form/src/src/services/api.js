const API_BASE_URL = '/api';

// Map UI category values to backend enum values
const CATEGORY_MAP = {
  'Defect': 'DEFECT',
  'Feature': 'FEATURE',
  'Improvement': 'ENHANCEMENT',
  'Other': 'OTHER'
};

// Reverse map for displaying categories from backend
const CATEGORY_REVERSE_MAP = {
  'DEFECT': 'Defect',
  'FEATURE': 'Feature',
  'ENHANCEMENT': 'Improvement',
  'OTHER': 'Other'
};

/**
 * Helper to convert category from UI to backend format
 */
const normalizeCategory = (category) => CATEGORY_MAP[category] || category;

/**
 * Helper to convert category from backend to UI format
 */
const denormalizeCategory = (category) => CATEGORY_REVERSE_MAP[category] || category;

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(url, options = {}) {
  try {
    // Add authentication header for API Gateway
    const headers = options.headers || {};
    // API Gateway requires X-API-Key when apiKeySource is "HEADER"
    headers['X-API-Key'] = 'test-key';
    headers['Authorization'] = 'Bearer test-token'; // Still include for safety

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Create a new feedback
 */
export async function createFeedback(feedbackData) {
  const payload = { ...feedbackData };
  delete payload.category;
  return fetchAPI(`${API_BASE_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Get feedback by ID
 */
export async function getFeedback(id) {
  try {
    const response = await fetchAPI(`${API_BASE_URL}/feedback/${id}`);
    console.log("getFeedback raw response:", response);
    const result = {
      ...response,
      category: denormalizeCategory(response.category),
    };
    console.log("getFeedback processed result:", result);
    return result;
  } catch (error) {
    console.error("getFeedback error:", error);
    throw error;
  }
}

/**
 * List feedback by tenant
 */
export async function listFeedback(tenantId, filters = {}) {
  const params = new URLSearchParams();
  params.append('tenant_id', tenantId);

  if (filters.status) params.append('status', filters.status);
  if (filters.category) params.append('category', normalizeCategory(filters.category));
  if (filters.user_id) params.append('user_id', filters.user_id);

  const response = await fetchAPI(`${API_BASE_URL}/feedback?${params.toString()}`);
  return response.map(feedback => ({
    ...feedback,
    category: denormalizeCategory(feedback.category),
  }));
}

/**
 * Update feedback (title, description, category, status)
 */
export async function updateFeedback(id, data) {
  const payload = {
    ...data,
    category: normalizeCategory(data.category),
  };
  return fetchAPI(`${API_BASE_URL}/feedback/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Update feedback status
 */
export async function updateFeedbackStatus(id, status) {
  return fetchAPI(`${API_BASE_URL}/feedback/${id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
}

/**
 * Delete feedback
 */
export async function deleteFeedback(id) {
  return fetchAPI(`${API_BASE_URL}/feedback/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Create a comment
 */
export async function createComment(feedbackId, userId, content) {
  return fetchAPI(`${API_BASE_URL}/feedback/${feedbackId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, content }),
  });
}

/**
 * Get comments for a feedback
 */
export async function getComments(feedbackId) {
  try {
    console.log("getComments called for feedbackId:", feedbackId);
    const response = await fetchAPI(`${API_BASE_URL}/feedback/${feedbackId}/comments`);
    console.log("getComments response:", response);
    return response;
  } catch (error) {
    console.error("getComments error:", error);
    throw error;
  }
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId, userId) {
  return fetchAPI(`${API_BASE_URL}/comments/${commentId}?user_id=${userId}`, {
    method: 'DELETE',
  });
}

/**
 * Add a vote (toggle on/off)
 */
export async function postVote(feedbackId, userId) {
  return fetchAPI(`${API_BASE_URL}/feedback/${feedbackId}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });
}

/**
 * Remove a vote
 */
export async function removeVote(feedbackId, userId) {
  return fetchAPI(`${API_BASE_URL}/feedback/${feedbackId}/vote`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });
}

/**
 * Create an attachment - uploads file directly to S3 (for LocalStack)
 */
export async function createAttachment(feedbackId, tenantId, file) {
  // Convert file to base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // Remove data URL prefix
      fetchAPI(
        `${API_BASE_URL}/attachment/${feedbackId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenantId,
          },
          body: JSON.stringify({
            file_name: file.name,
            file_data: base64,
          }),
        }
      ).then(resolve).catch(reject);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Complete attachment upload flow
 */
export async function uploadAttachment(feedbackId, tenantId, file) {
  return createAttachment(feedbackId, tenantId, file);
}

/**
 * Get list of attachments for a feedback
 */
export async function listAttachments(feedbackId) {
  return fetchAPI(`${API_BASE_URL}/feedback/${feedbackId}/attachments`);
}

/**
 * Get download URL for an attachment
 */
export async function getAttachmentDownloadURL(attachmentId) {
  const response = await fetchAPI(
    `${API_BASE_URL}/attachment/${attachmentId}`
  );
  return response.download_url;
}

/**
 * Delete an attachment
 * Deletes both the file from S3 and the record from the database
 */
export async function deleteAttachment(feedbackId, attachmentId) {
  return fetchAPI(`${API_BASE_URL}/attachment/${feedbackId}/${attachmentId}`, {
    method: 'DELETE',
  });
}

/**
 * Get presigned upload URL for a file
 * New functionality for presigned URL flow
 */
export async function getPresignedUploadURL(feedbackId, tenantId, fileName) {
  return fetchAPI(`${API_BASE_URL}/attachment/${feedbackId}?presigned=true&fileName=${encodeURIComponent(fileName)}`, {
    method: 'GET',
    headers: {
      'X-Tenant-ID': tenantId,
    },
  });
}

/**
 * Upload file directly to S3 using presigned URL
 * New functionality for presigned URL flow
 */
export function uploadFileDirectly(presignedURL, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('PUT', presignedURL);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.statusText);
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}

/**
 * Complete attachment upload - create DB record after S3 upload
 * New functionality for presigned URL flow
 */
export async function confirmAttachmentUpload(feedbackId, s3Key, fileName) {
  return fetchAPI(`${API_BASE_URL}/attachment/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      feedback_id: feedbackId,
      s3_key: s3Key,
      file_name: fileName,
    }),
  });
}
