const kindKey = Symbol.for("hei.errorKind");

/**
 * Base for errors that route handlers answer with a status. Next.js bundles server modules more than once
 * (instrumentation, each route) while they share one Agent and one Chats through globalThis, so an error thrown from
 * one bundle is not an instance of the class another bundle imports. Match errors by kind with `isHeiError()`.
 */
export class HeiError<Kind extends string = string> extends Error {
  readonly [kindKey]: Kind;

  constructor(kind: Kind, message: string) {
    super(message);
    this.name = kind;
    this[kindKey] = kind;
  }
}

export function isHeiError<Kind extends string>(
  error: unknown,
  kind: Kind,
): error is HeiError<Kind> {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { [kindKey]?: unknown })[kindKey] === kind
  );
}
