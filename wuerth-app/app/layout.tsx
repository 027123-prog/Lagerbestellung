import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Lagerbestellung", template: "%s – Lagerbestellung" },
  description: "Bestände zählen, leere Fächer markieren und passende Nachbestellmengen vorbereiten.",
  applicationName: "Würth Bestellhilfe",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bestellhilfe" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f6f5f2" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
