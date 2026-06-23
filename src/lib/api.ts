/**
 * API fetch helper that adds auth token from localStorage.
 * Use for all /api/* calls except auth (login, register, etc.)
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("hwo_auth_token") : null;
  const headers = new Headers(init?.headers);
  if (token && url.startsWith("/api/") && !url.startsWith("/api/auth/")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

/** Parse API error body — shared across all modules */
export async function parseApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // ignore non-JSON bodies
  }
  if (res.status === 401 || res.status === 403) {
    return res.status === 403
      ? "Permission denied"
      : "Session expired — please sign in again";
  }
  return fallback;
}

/** Download a file from an authenticated API endpoint */
export async function apiDownload(url: string, filename: string): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
