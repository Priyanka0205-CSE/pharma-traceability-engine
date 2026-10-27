import "./globals.css";

export const metadata = {
  title: "Pharma Trace",
  description: "Pharmaceutical supply chain serialized traceability engine",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
