import type { AgentEvent } from "@earendil-works/pi-durable";
import { withChat } from "../../request";

const KEEP_ALIVE_MS = 15_000;

/**
 * A chat's live state as server-sent events. Each message is a JSON array of pi-durable agent events: first the
 * snapshot, then one batch per commit. A reconnecting client gets a fresh snapshot; nothing is replayed.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]/events">,
) {
  return withChat(params, async (agent, chatId) => {
    const watch = await agent.watch(chatId);
    const encoder = new TextEncoder();
    let close = () => {};

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        const write = (chunk: string) => {
          if (open) controller.enqueue(encoder.encode(chunk));
        };
        const send = (events: readonly AgentEvent[]) =>
          write(`data: ${JSON.stringify(events)}\n\n`);
        const keepAlive = setInterval(
          () => write(": keep-alive\n\n"),
          KEEP_ALIVE_MS,
        );

        close = () => {
          if (!open) return;
          open = false;
          clearInterval(keepAlive);
          void watch.stop();
          controller.close();
        };

        send([watch.snapshot]);
        watch.start(async (events) => send(events));
        // The watch ends when the agent closes; ending the response makes the browser reconnect.
        void watch.closed.then(() => close());
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
  });
}
