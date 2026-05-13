/**
 * Returns a non-expired access token, refreshing silently if needed.
 *
 * Used by SSE/streaming endpoints that call `fetch()` directly and bypass the
 * Axios interceptor's 401-retry logic. Redirects to /login if no refresh token
 * is available or refresh fails.
 */
export async function getValidToken(): Promise<string | null> {
  const token = sessionStorage.getItem('accessToken');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    if (expiresAt - Date.now() > 60_000) return token;
  } catch {
    return token;
  }

  const refreshToken = sessionStorage.getItem('refreshToken');
  if (!refreshToken) { window.location.href = '/login'; return null; }

  try {
    const r = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!r.ok) { window.location.href = '/login'; return null; }
    const { data } = await r.json();
    sessionStorage.setItem('accessToken', data.accessToken);
    return data.accessToken;
  } catch {
    window.location.href = '/login';
    return null;
  }
}
