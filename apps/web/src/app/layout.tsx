import type { Metadata, Viewport } from "next";
import { jetbrainsMono, publicSans, sourceSerif } from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zaivo — press the button, the repair runs itself",
  description:
    "Press the button, and the job runs itself — while the address remembers everything. Verified tradies, upfront prices, live tracking, same-day payment.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0A1628",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${sourceSerif.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
