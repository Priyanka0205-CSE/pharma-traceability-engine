import { query } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle, readJson, toInt } from "@/lib/api";

export const GET = handle(async () => {
  const user = requireUser();
  const { rows } = await query(
    `SELECT b.batch_id, b.batch_no, d.name AS drug, b.mfg_date, b.expiry_date, b.status,
            COUNT(u.serial_no)::int AS units
       FROM batches b
       JOIN drugs d ON d.drug_id = b.drug_id
       LEFT JOIN serial_units u ON u.batch_id = b.batch_id
      WHERE ($1::text = 'ADMIN' OR d.manufacturer_id = $2)
      GROUP BY b.batch_id, d.name
      ORDER BY b.batch_id DESC`,
    [user.role, user.orgId]
  );
  return rows;
});

export const POST = handle(async (request) => {
  const user = requireUser(["MANUFACTURER"]);
  const body = await readJson(request);
  const drugId = toInt(body.drugId, "drugId");
  if (!body.batchNo || !body.mfgDate || !body.expiryDate)
    throw new HttpError(400, "batchNo, mfgDate and expiryDate are required");

  const own = await query("SELECT 1 FROM drugs WHERE drug_id = $1 AND manufacturer_id = $2", [drugId, user.orgId]);
  if (!own.rowCount) throw new HttpError(403, "You can only create batches for your own drugs");

  // CHECK constraint chk_dates in the database enforces expiry > mfg
  const { rows } = await query(
    `INSERT INTO batches(drug_id, batch_no, mfg_date, expiry_date)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [drugId, body.batchNo, body.mfgDate, body.expiryDate]
  );
  return rows[0];
});
