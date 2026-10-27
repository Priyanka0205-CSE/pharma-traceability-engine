import { query } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle, readJson } from "@/lib/api";

export const POST = handle(async (request) => {
  const user = requireUser(["PHARMACY"]);
  const { serial } = await readJson(request);
  if (!serial) throw new HttpError(400, "serial is required");
  // Triggers block recalled / expired / not-in-stock packs and mark the pack DISPENSED.
  const { rows } = await query(
    `INSERT INTO dispensations(serial_no, pharmacy_id, dispensed_by)
     VALUES ($1,$2,$3) RETURNING dispense_id, serial_no, dispensed_at`,
    [String(serial).trim(), user.orgId, user.userId]
  );
  return rows[0];
});
