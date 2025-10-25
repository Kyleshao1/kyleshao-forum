
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function get(endpoint) {
  const response = await fetch(`${API_URL}${endpoint}`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}

export async function post(endpoint, data) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}
export default {
  get,
  post,
};
