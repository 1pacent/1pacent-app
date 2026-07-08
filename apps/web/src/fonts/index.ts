import localFont from "next/font/local";

export const sourceSerif = localFont({
  src: "./source-serif-4.woff2",
  variable: "--font-serif",
  weight: "500 700",
  display: "swap",
});

export const publicSans = localFont({
  src: "./public-sans.woff2",
  variable: "--font-sans",
  weight: "400 700",
  display: "swap",
});

export const jetbrainsMono = localFont({
  src: "./jetbrains-mono.woff2",
  variable: "--font-mono",
  weight: "400 700",
  display: "swap",
});
