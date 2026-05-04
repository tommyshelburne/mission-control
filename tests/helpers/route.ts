// Shared helpers for API route tests.
//
// Route handlers receive a `Request` and `props.params` (a Promise in Next 15+).
// We don't spin up Next — we call the exported handlers directly and read the
// `NextResponse` they return.

export function jsonRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

export async function readJson(res: Response): Promise<any> {
  return await res.json();
}

export function paramsOf<T extends Record<string, string>>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}
