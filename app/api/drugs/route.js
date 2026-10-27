import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";

// Full-text search using the GIN-indexed tsvector column.
export const GET = handle(async (request) => {
  requireUser();
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  const sql = q
    ? `SELECT drug_id, name, generic_name, strength, dosage_form,
              ts_rank(search_vector, plainto_tsquery('english', $1)) AS rank
         FROM drugs WHERE search_vector @@ plainto_tsquery('english', $1)
         ORDER BY rank DESC, name LIMIT 50`
    : `SELECT drug_id, name, generic_name, strength, dosage_form FROM drugs ORDER BY name LIMIT 50`;
  const { rows } = await query(sql, q ? [q] : []);
  return rows;
});
