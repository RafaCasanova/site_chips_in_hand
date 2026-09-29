import { ApiError, TransportError } from './api-client.service';

export function abortError(): DOMException {
  return new DOMException('Operação cancelada.', 'AbortError');
}

export function isAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const finish = () => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, milliseconds);
    const cancel = () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/** Only repeats reads. The deadline also bounds a request still waiting on the network. */
export async function pollUntil<T>(options: {
  read: () => Promise<T>;
  pending: (value: T) => boolean;
  onValue: (value: T) => void;
  signal: AbortSignal;
  durationMs?: number;
}): Promise<'complete' | 'timeout'> {
  const deadline = Date.now() + (options.durationMs ?? 60_000);
  const deadlineResult = Symbol('deadline');
  while (Date.now() < deadline) {
    if (options.signal.aborted) throw abortError();
    const requestTimer = new AbortController();
    const cancel = () => requestTimer.abort();
    options.signal.addEventListener('abort', cancel, { once: true });
    try {
      const value = await Promise.race([
        options.read(),
        delay(Math.max(0, deadline - Date.now()), requestTimer.signal).then(() => deadlineResult),
      ]);
      if (options.signal.aborted) throw abortError();
      if (value === deadlineResult) return 'timeout';
      const result = value as T;
      options.onValue(result);
      if (!options.pending(result)) return 'complete';
    } catch (error) {
      if (!(error instanceof TransportError) && !(error instanceof ApiError && error.retryable)) {
        throw error;
      }
    } finally {
      requestTimer.abort();
      options.signal.removeEventListener('abort', cancel);
    }
    await delay(Math.min(3_000, Math.max(0, deadline - Date.now())), options.signal);
  }
  return 'timeout';
}
