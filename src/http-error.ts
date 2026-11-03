/** An error whose message is safe to show the client, with the HTTP status to send. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
/** Map any thrown value to a response. Unknown errors never leak their message. */
export function errorResponse(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
  // Errors from the body parsers (http-errors) carry a safe 4xx status: a request body that is
  // too large or malformed is the client's mistake, not a server failure.
  const parserError = err as { status?: unknown; expose?: unknown; type?: unknown } | null;
  const status = parserError?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && parserError?.expose === true)
    return {
      status,
      body: {
        error:
          parserError.type === 'entity.too.large'
            ? 'Request body is too large'
            : 'Invalid request body',
      },
    };
  return { status: 500, body: { error: 'Request could not be completed' } };
}
