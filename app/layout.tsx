import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/oxanium/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { HeroInteractionController } from "./components/HeroInteractionController";
import "./globals.css";
import "./scroll-performance.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "Portfolio of Jaxon, an AI Algorithm Engineer, featuring selected experience, education, and research publications.";

  return {
    metadataBase: new URL(origin),
    title: "JAXON — Compiling Intelligence for the Real World",
    description,
    alternates: { canonical: "/" },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    robots: { index: true, follow: true },
    openGraph: {
      title: "JAXON",
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "JAXON" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "JAXON",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <HeroInteractionController />
        {children}
      </body>
    </html>
  );
}
