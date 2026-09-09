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

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include', // kirim httpOnly cookie otomatis jika didukung browser
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err: any) {
    throw new Error(err?.message || 'Gagal terhubung ke server');
  }

  // Baca respons sebagai teks terlebih dahulu untuk menghindari crash 'Unexpected token <' jika server mengembalikan HTML
  const text = await res.text().catch(() => '');
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Jika respons berupa HTML (mis. 502/503 atau fallback SPA Vite saat server me-restart)
      if (text.trim().startsWith('<')) {
        if (!res.ok) {
          throw new Error(`Server error (${res.status}): Layanan sedang memuat. Coba beberapa saat lagi.`);
        }
        throw new Error(`Endpoint ${url} tidak tersedia (respons halaman web, bukan data JSON).`);
      }
      payload = { error: text.slice(0, 150) };
    }
  }

  if (res.status === 401) {
    if (!url.includes('/api/auth/login')) {
      clearToken();
    }
    throw new Error(payload?.error || payload?.message || 'Sesi telah berakhir atau tidak memiliki izin');
  }

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
  }

  return (payload ?? {}) as T;
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
