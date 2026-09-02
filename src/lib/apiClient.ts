import { toast } from 'sonner';

export function getToken(): string | null {
  return localStorage.getItem('token') || localStorage.getItem('gemas_token') || null;
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
  localStorage.setItem('gemas_token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('gemas_token');
  localStorage.removeItem('currentUser');
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include', // kirim httpOnly cookie otomatis jika didukung browser
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    if (!url.includes('/api/auth/login')) {
      clearToken();
    }
    const payload = await res.json().catch(() => ({ error: 'Username atau password salah' }));
    throw new Error(payload.error || 'Unauthorized');
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(payload.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(url: string)                => request<T>('GET',    url),
  post:   <T>(url: string, body: unknown) => request<T>('POST',   url, body),
  put:    <T>(url: string, body: unknown) => request<T>('PUT',    url, body),
  delete: <T>(url: string)                => request<T>('DELETE', url),
};

/** Fire-and-forget upsert — tidak block UI */
export function apiSave(collection: string, id: string, data: unknown) {
  const token = getToken();
  if (!token) return; // Jangan request jika belum login
  api.put(`/api/data/${collection}/${id}`, data)
    .catch(err => {
      console.warn(`[apiSave] ${collection}/${id}:`, err?.message || err);
    });
}

/** Fire-and-forget delete — tidak block UI */
export function apiRemove(collection: string, id: string) {
  const token = getToken();
  if (!token) return; // Jangan request jika belum login
  api.delete(`/api/data/${collection}/${id}`)
    .catch(err => {
      console.warn(`[apiRemove] ${collection}/${id}:`, err?.message || err);
    });
}
