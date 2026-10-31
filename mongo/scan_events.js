
/*
 * Pharmaceutical Supply Chain Traceability Engine
 * Task: MongoDB scan events, indexes, and aggregation
 *
 * Run:
 * mongosh "mongodb://localhost:27017/pharma_trace" --file mongo/scan_events.js
 */

// Select the project database
db = db.getSiblingDB("pharma_trace");

// Collection for pharmaceutical package scan events
const scanEvents = db.getCollection("scan_events");

// Sample scan events
// These demonstrate a medicine moving through the supply chain.
const sampleEvents = [
  {
    event_id: "SCAN-1001",
    serial_no: "SN-00001-0000001",
    batch_no: "B2026-A1",
    event_type: "MANUFACTURED",
    location: "Medico Pharma Ltd, Bengaluru",
    scanned_by: "manufacturer",
    timestamp: ISODate("2026-10-25T09:00:00Z"),
    result: "SUCCESS"
  },
  {
    event_id: "SCAN-1002",
    serial_no: "SN-00001-0000001",
    batch_no: "B2026-A1",
    event_type: "DISPATCHED",
    location: "Medico Pharma Ltd, Bengaluru",
    scanned_by: "manufacturer",
    timestamp: ISODate("2026-10-25T11:30:00Z"),
    result: "SUCCESS"
  },
  {
    event_id: "SCAN-1003",
    serial_no: "SN-00001-0000001",
    batch_no: "B2026-A1",
    event_type: "RECEIVED",
    location: "SwiftMed Distributors, Bengaluru",
    scanned_by: "distributor",
    timestamp: ISODate("2026-10-26T08:15:00Z"),
    result: "SUCCESS"
  },
  {
    event_id: "SCAN-1004",
    serial_no: "SN-00001-0000002",
    batch_no: "B2026-A1",
    event_type: "MANUFACTURED",
    location: "Medico Pharma Ltd, Bengaluru",
    scanned_by: "manufacturer",
    timestamp: ISODate("2026-10-25T09:10:00Z"),
    result: "SUCCESS"
  },
  {
    event_id: "SCAN-1005",
    serial_no: "SN-00001-0000002",
    batch_no: "B2026-A1",
    event_type: "VERIFICATION_FAILED",
    location: "Unknown location",
    scanned_by: "unknown",
    timestamp: ISODate("2026-10-27T14:45:00Z"),
    result: "FAILED"
  },
  {
    event_id: "SCAN-1006",
    serial_no: "SN-00002-0000001",
    batch_no: "B2026-B7",
    event_type: "MANUFACTURED",
    location: "Medico Pharma Ltd, Bengaluru",
    scanned_by: "manufacturer",
    timestamp: ISODate("2026-10-26T10:00:00Z"),
    result: "SUCCESS"
  }
];

// Insert only events that are not already present.
// event_id must be unique for this script's idempotent behavior.
for (const event of sampleEvents) {
  scanEvents.updateOne(
    { event_id: event.event_id },
    { $setOnInsert: event },
    { upsert: true }
  );
}

// Indexes for common lookup and analysis operations
scanEvents.createIndex({ event_id: 1 }, { unique: true });
scanEvents.createIndex({ serial_no: 1, timestamp: -1 });
scanEvents.createIndex({ batch_no: 1 });
scanEvents.createIndex({ event_type: 1, timestamp: -1 });

// Display inserted sample events
print("\n--- Sample scan events ---");
printjson(scanEvents.find({}, { _id: 0 }).sort({ timestamp: 1 }).toArray());

// Aggregation: event counts and failed scans by event type
print("\n--- Scan activity summary ---");
printjson(
  scanEvents.aggregate([
    {
      $group: {
        _id: "$event_type",
        total_events: { $sum: 1 },
        failed_events: {
          $sum: {
            $cond: [{ $eq: ["$result", "FAILED"] }, 1, 0]
          }
        }
      }
    },
    { $sort: { total_events: -1, _id: 1 } }
  ]).toArray()
);

// Show the scan history for one serial number
print("\n--- Scan history for SN-00001-0000001 ---");
printjson(
  scanEvents.find(
    { serial_no: "SN-00001-0000001" },
    { _id: 0 }
  ).sort({ timestamp: 1 }).toArray()
);

print("\nScan-event setup completed.");
