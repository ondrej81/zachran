import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rohlík Wishlist",
  description: "Hlídá slevy na tvých oblíbených produktech.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold">
              Rohlík hlídač slev
            </Link>
            <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
              Nastavení
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
