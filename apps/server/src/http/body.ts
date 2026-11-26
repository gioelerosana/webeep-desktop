/*
 * Limite di 1 MB sul corpo delle richieste (docs/SERVER.md §7).
 *
 * Il corpo viene letto una volta sola, con il limite, e la richiesta restituita ha
 * il corpo già in memoria: così ogni gestore può leggerlo senza sorprese.
 */

export const MAX_BODY_BYTES = 1024 * 1024;

// Metodi che in questo server non portano un corpo utile.
const BODYLESS_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'DELETE']);
const CONTENT_LENGTH_HEADER = 'content-length';

class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError';
}

/** Interrompe lo stream appena supera il limite, senza leggere oltre. */
const limitStream = (source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
  let received = 0;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_BODY_BYTES) {
          controller.error(new BodyTooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
};

/**
 * Restituisce la richiesta con il corpo già letto, oppure null se il corpo supera 1 MB.
 * Le richieste senza corpo tornano invariate.
 */
export const bufferRequestBody = async (request: Request): Promise<Request | null> => {
  const body = request.body;
  if (BODYLESS_METHODS.has(request.method) || body === null) return request;

  const declared = request.headers.get(CONTENT_LENGTH_HEADER);
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return null;

  try {
    const bytes = new Uint8Array(await new Response(limitStream(body)).arrayBuffer());
    return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return null;
    throw error;
  }
};
