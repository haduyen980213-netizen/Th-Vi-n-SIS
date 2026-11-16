import { auth } from './firebase';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'API_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SESSION_STORAGE_KEY = 'sis_session_token';

export function getStoredSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null) {
  try {
    if (token) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / restricted iframe errors
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach Firebase ID token automatically if signed in via Google Sign-In;
  // otherwise attach stored local sessionToken so iframe contexts without 3P cookies work reliably
  const currentUser = auth.currentUser;
  if (currentUser && !headers.has('Authorization')) {
    try {
      const idToken = await currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${idToken}`);
    } catch {
      const localToken = getStoredSessionToken();
      if (localToken) {
        headers.set('Authorization', `Bearer ${localToken}`);
      }
    }
  } else if (!headers.has('Authorization')) {
    const localToken = getStoredSessionToken();
    if (localToken) {
      headers.set('Authorization', `Bearer ${localToken}`);
    }
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    const errMsg =
      payload?.error?.message ||
      (res.status === 404
        ? 'Không tìm thấy máy chủ dữ liệu (/api/v1 trả về 404). Đường dẫn hiện tại có thể chỉ đang chạy bản tĩnh (dist) mà chưa khởi chạy máy chủ backend.'
        : `Yêu cầu thất bại (${res.status})`);
    const errCode = payload?.error?.code || 'HTTP_ERROR';
    throw new ApiError(errMsg, errCode, res.status);
  }

  return payload.data as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  method: 'POST' | 'PATCH' = 'POST'
): Promise<T> {
  return apiRequest<T>(path, {
    method,
    body: formData,
  });
}
