const KEEP_ALIVE_MS = 15_000;

type Source = {
  /** Write one SSE message holding `data` as JSON. */
  send: (data: unknown) => void;
  /** End the response; the browser's EventSource reconnects on its own. */
  close: () => void;
};

/**
 * A server-sent events response. `start` begins sending and returns the cleanup to run when the client goes away or
 * the stream is closed.
 */
export function eventStream(
  request: Request,
  start: (source: Source) => () => void,
): Response {
  const encoder = new TextEncoder();
  let close = () => {};

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (open) controller.enqueue(encoder.encode(chunk));
      };
      const keepAlive = setInterval(
        () => write(": keep-alive\n\n"),
        KEEP_ALIVE_MS,
      );
      let cleanup = () => {};

      close = () => {
        if (!open) return;
        open = false;
        clearInterval(keepAlive);
        cleanup();
        controller.close();
      };

      cleanup = start({
        send: (data) => write(`data: ${JSON.stringify(data)}\n\n`),
        close: () => close(),
      });
      request.signal.addEventListener("abort", () => close());
    },
    cancel() {
      close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
