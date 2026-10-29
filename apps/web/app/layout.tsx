import "./globals.css";
import type { CSSProperties, ReactNode } from "react";
import { getHostInfo } from "../lib/server-api";

export async function generateMetadata() {
  const info = await getHostInfo();
  return { title: info.kind === "agency" ? (info.branding.appName ?? info.name) : "Ownlevel" };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const info = await getHostInfo();
  const style = (info.kind === "agency" && info.branding.primaryColor
    ? { "--brand": info.branding.primaryColor }
    : undefined) as CSSProperties | undefined;
  return (
    <html lang="en">
      <body style={style}>
        {info.kind === "agency" && (
          <header className="brand">
            {info.branding.logoUrl && <img src={info.branding.logoUrl} alt="" height={28} />}
            <strong>{info.branding.appName ?? info.name}</strong>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
