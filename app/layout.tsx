import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ledger",
  description: "A little clarity for your food spending.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="shell">
          <header className="brand">
            <Link href="/" prefetch={false}>
              Ledger
              <span className="brand-dot" aria-hidden="true" />
            </Link>
            <span>
              {/* Parentheses hint that the category will be changeable. */}
              <span className="category">
                <span aria-hidden="true">(</span>Food
                <span aria-hidden="true">)</span>
              </span>
              , in perspective.
            </span>
          </header>
          <main id="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
