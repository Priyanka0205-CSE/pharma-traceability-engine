import { query } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle, readJson, toInt } from "@/lib/api";

export const GET = handle(async () => {
  const user = requireUser();
  const { rows } = await query(
    `SELECT s.shipment_id, f.name AS from_org, t.name AS to_org, s.ship_date,
            s.received_date, s.status, COUNT(i.serial_no)::int AS items
       FROM shipments s
       JOIN organizations f ON f.org_id = s.from_org_id
       JOIN organizations t ON t.org_id = s.to_org_id
       LEFT JOIN shipment_items i ON i.shipment_id = s.shipment_id
      WHERE $1::text = 'ADMIN' OR s.from_org_id = $2 OR s.to_org_id = $2
      GROUP BY s.shipment_id, f.name, t.name
      ORDER BY s.shipment_id DESC`,
    [user.role, user.orgId]
  );
  return rows;
});

// Create shipment: runs create_shipment() as ONE transaction.
// If any serial is expired/recalled/not owned, a trigger raises an error and everything rolls back.
export const POST = handle(async (request) => {
  const user = requireUser(["MANUFACTURER", "DISTRIBUTOR"]);
  const body = await readJson(request);
  const toOrgId = toInt(body.toOrgId, "toOrgId");
  const serials = Array.isArray(body.serials) ? body.serials.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!serials.length) throw new HttpError(400, "Provide at least one serial number");
  if (serials.length > 500) throw new HttpError(400, "Maximum 500 serials per shipment");

  const { rows } = await query("SELECT create_shipment($1,$2,$3) AS shipment_id", [user.orgId, toOrgId, serials]);
  return rows[0];
});
