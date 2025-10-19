
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function getPosts() {
  const res = await fetch(`${API_BASE}/posts`);
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}
export default api;
