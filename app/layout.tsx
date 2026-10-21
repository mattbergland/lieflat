import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lie-Flat — Never fly below business",
  description:
    "Find premium-cabin award seats, map the points you already hold, and catch the next great fare.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
