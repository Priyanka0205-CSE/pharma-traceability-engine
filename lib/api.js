import { HttpError } from "./auth";

// Wraps every route: turns thrown errors (including PostgreSQL trigger /
// constraint errors) into clean JSON responses.
export function handle(fn) {
  return async (request, ctx) => {
    try {
      const data = await fn(request, ctx);
      return Response.json(data);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      // P0001 = RAISE EXCEPTION from our triggers/functions; 23xxx = constraint violations
      if (e.code === "P0001" || (e.code && e.code.startsWith("23"))) {
        return Response.json({ error: e.message, db_code: e.code }, { status: 400 });
      }
      console.error(e);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export function toInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} must be a positive integer`);
  return n;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
