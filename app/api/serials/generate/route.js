import { query } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle, readJson, toInt } from "@/lib/api";

export const POST = handle(async (request) => {
  const user = requireUser(["MANUFACTURER"]);
  const body = await readJson(request);
  const batchId = toInt(body.batchId, "batchId");
  const count = toInt(body.count, "count");

  const own = await query(
    `SELECT 1 FROM batches b JOIN drugs d ON d.drug_id = b.drug_id
      WHERE b.batch_id = $1 AND d.manufacturer_id = $2`,
    [batchId, user.orgId]
  );
  if (!own.rowCount) throw new HttpError(403, "That batch does not belong to your organization");

  const { rows } = await query("SELECT generate_serials($1,$2,$3) AS generated", [batchId, user.orgId, count]);
  return rows[0];
});
