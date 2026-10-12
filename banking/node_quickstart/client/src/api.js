export function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

export function getToken() {
  return localStorage.getItem('banking_token');
}

export function setToken(token) {
  localStorage.setItem('banking_token', token);
}

export function clearToken() {
  localStorage.removeItem('banking_token');
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}
