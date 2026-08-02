import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { HeroInteractionController } from "./components/HeroInteractionController";
import { MobileLoadFeedback } from "./components/MobileLoadFeedback";
import { SiteTracingBeam } from "./components/SiteTracingBeam";
import "./fonts.css";
import "./globals.css";
import "./scroll-performance.css";

export const viewport: Viewport = {
  colorScheme: "dark",
  initialScale: 1,
  themeColor: "#05070B",
  viewportFit: "cover",
  width: "device-width",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Jaxon | AI Engineer";
  const description = "AI Engineer specializing in AI agents, AIGC, VLMs, LLMs, and autonomous driving.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: "/" },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Vinext 0.0.50 emits its own default viewport but does not serialize
            viewportFit from the metadata export. Keep this final override until
            the shim supports viewport-fit, then remove it with its contract test. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body>
        <HeroInteractionController />
        <MobileLoadFeedback />
        <SiteTracingBeam />
        {children}
      </body>
    </html>
  );
}
