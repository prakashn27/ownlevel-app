import "./globals.css";
import type { CSSProperties, ReactNode } from "react";
import { getHostInfo } from "../lib/server-api";
import { isFaviconHost } from "../lib/favicon";

export async function generateMetadata() {
  const info = await getHostInfo();
  const title = info.kind === "agency" ? (info.branding.appName ?? info.name) : "Ownlevel";
  // Only app.ownlevel.app gets a favicon; other hosts explicitly get none.
  const icons = (await isFaviconHost())
    ? [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
        { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      ]
    : [];
  return { title, icons };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const info = await getHostInfo();
  const style = (info.kind === "agency" && info.branding.primaryColor
    ? { "--brand": info.branding.primaryColor }
    : undefined) as CSSProperties | undefined;
  return (
    <html lang="en">
      <body style={style} className={info.kind === "agency" ? undefined : "theme-ownlevel"}>
        {info.kind === "agency" && (
          <header className="flex items-center gap-2 border-b bg-card px-5 py-3">
            {info.branding.logoUrl && <img src={info.branding.logoUrl} alt="" height={28} className="h-7 w-auto" />}
            <strong className="font-semibold">{info.branding.appName ?? info.name}</strong>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
