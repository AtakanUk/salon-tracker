export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; contentType?: string } = {},
): Promise<T> {
  // a Blob body (file upload) is sent as-is; anything else is JSON
  const raw = options.body instanceof Blob;
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers:
      options.body === undefined
        ? undefined
        : {
            'Content-Type': raw
              ? (options.contentType ?? 'application/octet-stream')
              : 'application/json',
          },
    body:
      options.body === undefined
        ? undefined
        : raw
          ? (options.body as Blob)
          : JSON.stringify(options.body),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let code = 'generic';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) code = data.error;
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(res.status, code);
  }
  return res.json() as Promise<T>;
}
