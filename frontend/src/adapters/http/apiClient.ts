/**
 * Minimal JSON client for the Express backend (backend/src/app.js).
 * In development Vite proxies /api to the backend, so the base URL is same-origin.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  send<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T>;
}

export function createApiClient(baseUrl = '', fetchImpl: typeof fetch = (...a) => fetch(...a)): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json);
    return json as T;
  }
  return {
    get: (path) => request('GET', path),
    send: (method, path, body) => request(method, path, body),
  };
}
