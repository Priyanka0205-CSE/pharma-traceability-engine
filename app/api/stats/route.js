import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";

export const GET = handle(async () => {
  const user = requireUser();
  const isAdmin = user.role === "ADMIN";

  // GROUP BY + aggregate
  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS units FROM serial_units
      WHERE $1::boolean OR current_owner_org_id = $2 GROUP BY status ORDER BY units DESC`,
    [isAdmin, user.orgId]
  );
  // View
  const stock = await query(
    `SELECT drug, units_in_stock::int FROM v_stock_by_org
      WHERE $1::boolean OR org_id = $2 ORDER BY units_in_stock DESC LIMIT 10`,
    [isAdmin, user.orgId]
  );
  // View with days left to expiry
  const expiring = await query(
    `SELECT drug, batch_no, expiry_date, days_left, units::int FROM v_expiring_stock
      WHERE $1::boolean OR organization = (SELECT name FROM organizations WHERE org_id = $2)
      ORDER BY days_left LIMIT 10`,
    [isAdmin, user.orgId]
  );
  // GROUP BY + HAVING: organizations currently holding recalled units
  const recalledHolders = isAdmin
    ? (await query(
        `SELECT o.name, COUNT(*)::int AS recalled_units
           FROM serial_units u JOIN organizations o ON o.org_id = u.current_owner_org_id
          WHERE u.status = 'RECALLED'
          GROUP BY o.name HAVING COUNT(*) > 0 ORDER BY recalled_units DESC`
      )).rows
    : [];
  const audit = isAdmin
    ? (await query("SELECT log_id, table_name, action, record_id, changed_at FROM audit_log ORDER BY log_id DESC LIMIT 10")).rows
    : [];

  return { byStatus: byStatus.rows, stock: stock.rows, expiring: expiring.rows, recalledHolders, audit };
});
