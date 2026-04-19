/** Shared 5s cap for discover feed + home mix pipelines (Railway slow / 502 bursts). */
export const DISCOVER_FETCH_TIMEOUT_MS = 5000;

export function raceWithDiscoverTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('DISCOVER_FETCH_TIMEOUT'));
    }, DISCOVER_FETCH_TIMEOUT_MS);
    p.then(
      (v) => {
        if (timer) clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (timer) clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function isDiscoverBackendFailure(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /HTTP_500|HTTP_502|\b500\b|\b502\b|DISCOVER_FETCH_TIMEOUT/i.test(m);
}
