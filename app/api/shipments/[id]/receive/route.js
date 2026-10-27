import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, toInt } from "@/lib/api";

// Receiving transfers custody of every item atomically (receive_shipment()).
export const POST = handle(async (request, { params }) => {
  const user = requireUser(["DISTRIBUTOR", "PHARMACY"]);
  const id = toInt(params.id, "shipment id");
  const { rows } = await query("SELECT receive_shipment($1,$2) AS units_received", [id, user.orgId]);
  return rows[0];
});
