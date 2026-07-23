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

  return {
    title: "JAXON — Compiling Intelligence for the Real World",
    description:
      "AI algorithm engineer portfolio featuring production experience, deep learning research, and technical foundations in sensing and geospatial intelligence.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "JAXON — AI Algorithm Engineer",
      description: "Production AI systems, signal-aware learning, and geospatial intelligence research from Jaxon.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "JAXON" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "JAXON — AI Algorithm Engineer",
      description: "Production AI systems, signal-aware learning, and geospatial intelligence research from Jaxon.",
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
