import { query } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle, readJson, toInt } from "@/lib/api";

export const GET = handle(async () => {
  requireUser();
  const { rows } = await query("SELECT * FROM v_recall_impact ORDER BY recall_id DESC, holder");
  return rows;
});

export const POST = handle(async (request) => {
  const user = requireUser(["ADMIN"]);
  const body = await readJson(request);
  const batchId = toInt(body.batchId, "batchId");
  if (!body.reason || body.reason.trim().length < 10)
    throw new HttpError(400, "Reason must be at least 10 characters");
  const { rows } = await query("SELECT initiate_recall($1,$2,$3) AS units_recalled", [batchId, body.reason, user.userId]);
  return rows[0];
});
