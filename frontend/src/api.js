const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function fetchPosts() {
  const res = await fetch(`${API_BASE}/api/posts`);
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export async function registerUser(data) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Register failed');
  return res.json();
}
