import { heiForRequest } from "@/app/api/hei";
import { withTodo } from "../../request";

/** Stop the todo's agent, or take it out of the queue. Its chat stays. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/todos/[id]/stop-agent">,
) {
  return withTodo(params, async (_todos, todoId) => {
    const { handOffs } = await heiForRequest();
    await handOffs.stop(todoId);
    return new Response(null, { status: 204 });
  });
}
