import { heiForRequest } from "@/app/api/hei";
import { withTodo } from "../../request";

/** Hand the todo to an agent: it starts now, or waits in line while two are working. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/todos/[id]/hand-off">,
) {
  return withTodo(params, async (_todos, todoId) => {
    const { handOffs } = await heiForRequest();
    return Response.json({ todo: await handOffs.handOff(todoId) });
  });
}
