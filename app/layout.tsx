import type { Metadata, Viewport } from "next";
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

const siteOrigin = "https://jaxonhu1024.github.io";
const title = "Jaxon | AI Engineer";
const description = "AI Engineer specializing in AI agents, AIGC, VLMs, LLMs, and autonomous driving.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title,
  description,
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    images: [
      {
        url: "/assets/jaxon-signal-og.png",
        width: 1732,
        height: 908,
        alt: "JAXON signal field",
      },
    ],
    type: "website",
    url: siteOrigin,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/assets/jaxon-signal-og.png"],
  },
};

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
