import type { Metadata } from "next";

import NotFound from "../not-found";

export const metadata: Metadata = {
  title: "404 — Signal Lost | JAXON",
  description: "The requested route could not be found on JAXON.",
  robots: { index: false, follow: false },
};

export default NotFound;
