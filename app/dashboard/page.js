"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status });
  return data;
}

function Table({ rows }) {
  if (!rows || !rows.length) return <p style={{ color: "var(--muted)" }}>No data yet.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? "")}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Generic small form: fields = [{name, label, type, textarea}]
function ActionForm({ title, fields, onSubmit, button }) {
  const [vals, setVals] = useState({});
  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); onSubmit(vals); }}>
      <h2>{title}</h2>
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={title + f.name}>{f.label}</label>
          {f.textarea ? (
            <textarea id={title + f.name} rows={3} required onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
          ) : (
            <input id={title + f.name} type={f.type || "text"} required onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
          )}
        </div>
      ))}
      <button type="submit">{button || "Submit"}</button>
    </form>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [recalls, setRecalls] = useState([]);
  const [drugQ, setDrugQ] = useState("");
  const [drugs, setDrugs] = useState([]);
  const [msg, setMsg] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const user = await api("/api/me");
      setMe(user);
      setStats(await api("/api/stats"));
      setShipments(await api("/api/shipments"));
      setBatches(await api("/api/batches"));
      setRecalls(await api("/api/recalls"));
    } catch (e) {
      if (e.status === 401) router.push("/login");
      else setMsg({ type: "err", text: e.message });
    }
  }, [router]);

  useEffect(() => { refresh(); }, [refresh]);

  async function run(fn, okText) {
    setMsg(null);
    try {
      const out = await fn();
      setMsg({ type: "ok", text: `${okText}: ${JSON.stringify(out)}` });
      refresh();
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  }

  async function searchDrugs(e) {
    e.preventDefault();
    try { setDrugs(await api(`/api/drugs?q=${encodeURIComponent(drugQ)}`)); }
    catch (err) { setMsg({ type: "err", text: err.message }); }
  }

  async function logout() {
    await api("/api/auth/logout", "POST");
    router.push("/login");
  }

  if (!me) return <main className="wrap"><p>Loading…</p></main>;
  const role = me.role;
  const serialsFrom = (t) => t.split(/[\s,]+/).filter(Boolean);

  return (
    <main className="wrap">
      <div className="bar">
        <div>
          <h1>Dashboard</h1>
          <span style={{ color: "var(--muted)" }}>{me.name} · {role}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/verify"><button className="ghost">Verify a pack</button></a>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </div>

      {msg && <div className={`msg ${msg.type}`} role="status">{msg.text}</div>}

      <div className="grid">
        <section className="panel"><h2>Units by status</h2><Table rows={stats?.byStatus} /></section>
        <section className="panel"><h2>Stock by drug</h2><Table rows={stats?.stock} /></section>
        <section className="panel"><h2>Expiring within 90 days</h2><Table rows={stats?.expiring} /></section>
        {role === "ADMIN" && (
          <section className="panel"><h2>Holders of recalled units</h2><Table rows={stats?.recalledHolders} /></section>
        )}
      </div>

      <h2 style={{ marginTop: 28 }}>Actions</h2>
      <div className="grid">
        {role === "MANUFACTURER" && (
          <>
            <ActionForm title="Create batch" button="Create"
              fields={[{ name: "drugId", label: "Drug id", type: "number" }, { name: "batchNo", label: "Batch number" },
                       { name: "mfgDate", label: "Manufacture date", type: "date" }, { name: "expiryDate", label: "Expiry date", type: "date" }]}
              onSubmit={(v) => run(() => api("/api/batches", "POST", { ...v, drugId: Number(v.drugId) }), "Batch created")} />
            <ActionForm title="Generate serial numbers" button="Generate"
              fields={[{ name: "batchId", label: "Batch id", type: "number" }, { name: "count", label: "How many", type: "number" }]}
              onSubmit={(v) => run(() => api("/api/serials/generate", "POST", { batchId: Number(v.batchId), count: Number(v.count) }), "Serials generated")} />
          </>
        )}
        {(role === "MANUFACTURER" || role === "DISTRIBUTOR") && (
          <ActionForm title="Create shipment" button="Ship"
            fields={[{ name: "toOrgId", label: "Destination organization id", type: "number" },
                     { name: "serials", label: "Serial numbers (separate by space, comma or new line)", textarea: true }]}
            onSubmit={(v) => run(() => api("/api/shipments", "POST", { toOrgId: Number(v.toOrgId), serials: serialsFrom(v.serials) }), "Shipment created")} />
        )}
        {(role === "DISTRIBUTOR" || role === "PHARMACY") && (
          <ActionForm title="Receive shipment" button="Receive"
            fields={[{ name: "id", label: "Shipment id", type: "number" }]}
            onSubmit={(v) => run(() => api(`/api/shipments/${Number(v.id)}/receive`, "POST"), "Received")} />
        )}
        {role === "PHARMACY" && (
          <ActionForm title="Dispense a pack" button="Dispense"
            fields={[{ name: "serial", label: "Serial number" }]}
            onSubmit={(v) => run(() => api("/api/dispense", "POST", v), "Dispensed")} />
        )}
        {role === "ADMIN" && (
          <ActionForm title="Issue recall" button="Recall batch"
            fields={[{ name: "batchId", label: "Batch id", type: "number" }, { name: "reason", label: "Reason (min 10 characters)", textarea: true }]}
            onSubmit={(v) => run(() => api("/api/recalls", "POST", { batchId: Number(v.batchId), reason: v.reason }), "Recall issued")} />
        )}
        <form className="panel" onSubmit={searchDrugs}>
          <h2>Search drugs (full-text)</h2>
          <label htmlFor="dq">Name or generic name</label>
          <input id="dq" value={drugQ} onChange={(e) => setDrugQ(e.target.value)} />
          <button type="submit">Search</button>
          {drugs.length > 0 && <div style={{ marginTop: 12 }}><Table rows={drugs} /></div>}
        </form>
      </div>

      <div className="grid" style={{ marginTop: 28 }}>
        <section className="panel"><h2>Shipments</h2><Table rows={shipments} /></section>
        <section className="panel"><h2>Batches</h2><Table rows={batches} /></section>
        <section className="panel"><h2>Recall impact</h2><Table rows={recalls} /></section>
        {role === "ADMIN" && <section className="panel"><h2>Audit log (latest)</h2><Table rows={stats?.audit} /></section>}
      </div>
    </main>
  );
}
