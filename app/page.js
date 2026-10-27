import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap narrow">
      <h1>Pharma Trace</h1>
      <p>Track every medicine pack from factory to pharmacy, verify serial numbers, and run recalls.</p>
      <p><Link href="/login">Staff login</Link></p>
      <p><Link href="/verify">Verify a pack (public)</Link></p>
    </main>
  );
}
