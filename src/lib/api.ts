export const API_PORT = 3000;
export const getBaseUrl = () => {
  // If we're on a real URL (not localhost:5173), use relative path
  if (window.location.port !== '5173' && window.location.hostname !== 'localhost') {
    return '/api';
  }
  // Fallback for local development
  return `http://${window.location.hostname}:${API_PORT}/api`;
};

export const api = {
  async get(endpoint: string) {
    const res = await fetch(`${getBaseUrl()}${endpoint}`);
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  },
  
  async post(endpoint: string, body: any) {
    const res = await fetch(`${getBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `API Error: ${res.statusText}`);
    }
    return res.json();
  },

  async put(endpoint: string, body: any) {
    const res = await fetch(`${getBaseUrl()}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  },

  async patch(endpoint: string, body: any = {}) {
    const res = await fetch(`${getBaseUrl()}${endpoint}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  },

  async delete(endpoint: string) {
    const res = await fetch(`${getBaseUrl()}${endpoint}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  }
};