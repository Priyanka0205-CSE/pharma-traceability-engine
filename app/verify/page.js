"use client";

import { useState } from "react";

export default function VerifyPage() {
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(event) {
    event.preventDefault();
    const value = serial.trim();

    if (!value || value.length > 40) {
      setError("Please enter a valid serial number (maximum 40 characters).");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `/api/verify?serial=${encodeURIComponent(value)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Verification failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err.message || "Unable to verify this serial number.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "60px auto",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Medicine Serial Verification</h1>
      <p>
        Enter the serial number printed on your medicine package to check its
        traceability information.
      </p>

      <form onSubmit={handleVerify}>
        <label htmlFor="serial">
          <strong>Medicine serial number</strong>
        </label>

        <input
          id="serial"
          type="text"
          value={serial}
          onChange={(event) => setSerial(event.target.value)}
          placeholder="e.g. SN-00001-0000001"
          maxLength={40}
          required
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "12px",
            margin: "10px 0 16px",
            border: "1px solid #bbb",
            borderRadius: "6px",
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 20px",
            border: "none",
            borderRadius: "6px",
            background: "#176b45",
            color: "white",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Checking..." : "Verify Medicine"}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: "#b42318", marginTop: "20px" }}>
          {error}
        </p>
      )}

      {result && (
        <section
          aria-live="polite"
          style={{
            marginTop: "24px",
            padding: "18px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            overflowWrap: "anywhere",
          }}
        >
          <h2>Verification Result</h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontFamily: "inherit",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
