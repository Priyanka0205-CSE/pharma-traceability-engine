import { query } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getMongoDb } from "@/lib/mongo";

// Public endpoint: anyone can check a serial number.
export const GET = handle(async (request) => {
  const serial = new URL(request.url).searchParams.get("serial");
  if (!serial || serial.length > 40) throw new HttpError(400, "A valid serial is required");

  const { rows } = await query("SELECT * FROM verify_serial($1)", [serial]);

  // Log the scan in MongoDB (NoSQL event log). Never fail the request if Mongo is down.
  try {
    const db = await getMongoDb();
    await db.collection("scan_events").insertOne({
      serial_no: serial,
      scan_type: "VERIFY",
      result: rows[0]?.result,
      timestamp: new Date(),
    });
  } catch (e) {
    console.warn("Mongo scan log skipped:", e.message);
  }
  return rows[0];
});
