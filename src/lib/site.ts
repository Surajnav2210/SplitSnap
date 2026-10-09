// Site-wide constants for metadata, sitemap, robots and JSON-LD.

import type { Metadata } from "next";

type OpenGraph = NonNullable<Metadata["openGraph"]>;
type Twitter = NonNullable<Metadata["twitter"]>;

/** Public origin, e.g. https://splitsnap.vercel.app (no trailing slash). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const SITE_NAME = "SplitSnap";
export const SITE_TAGLINE = "Split the bill before the waiter comes back";
export const SITE_DESCRIPTION =
  "Free receipt scanner and bill splitter. Snap the receipt, everyone taps what they had, and tax and tip are split fairly. Itemized, no sign-up, with one-tap Venmo, PayPal and Cash App links.";

export const CONTACT_EMAIL = "hello@splitsnap.example";

/** The generated social card (src/app/opengraph-image.tsx). */
export const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "SplitSnap: split the bill before the waiter comes back.",
};

/**
 * Open Graph fields shared by every page. Metadata merges shallowly, so a page
 * that sets openGraph must spread this to keep the social image.
 */
export const baseOpenGraph = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_US",
  images: [SOCIAL_IMAGE],
} satisfies OpenGraph;

/** Twitter card fields shared by every page that overrides `twitter`. */
export const baseTwitter = {
  card: "summary_large_image",
  images: [SOCIAL_IMAGE],
} satisfies Twitter;
