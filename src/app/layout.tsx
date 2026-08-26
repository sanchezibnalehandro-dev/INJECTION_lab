import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INJECTION LAB",
  description: "A live prompt-injection demonstration harness.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
