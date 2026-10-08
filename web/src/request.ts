export const REQUEST_TIMEOUT_MS = 15000;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
  }
}

// Race the entire response, including body reading. Aborting also releases the
// network connection; the race still settles if a transport ignores abort.
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestError("The request timed out. Please retry.", true));
    }, REQUEST_TIMEOUT_MS);
  });
  const signal = options?.signal;
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const perform = async (): Promise<T> => {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new RequestError(
          body?.error || `Request failed (${response.status}). Please retry.`,
          response.status >= 500,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(
        "The connection was interrupted. Please retry.",
        true,
      );
    }
  };
  try {
    return await Promise.race([perform(), cancelled]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", cancel);
  }
}
