import { toast as sonner } from 'sonner';

export const toast = {
  success: (message: string) => sonner.success(message),
  error:   (message: string) => sonner.error(message),
  info:    (message: string) => sonner.message(message),
};

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let body = '';
    try { body = (await res.json()).error ?? ''; } catch { body = await res.text().catch(() => ''); }
    throw new Error(body || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
