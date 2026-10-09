import type { Metadata } from "next";
import { SplitApp } from "@/features/bill/SplitApp";
import { baseOpenGraph, baseTwitter } from "@/lib/site";

const title = "Split a bill";
const description =
  "Scan a receipt, add your friends, tap who had what, and send everyone a Venmo, PayPal or Cash App link for exactly what they owe. Free, no sign-up.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/split" },
  openGraph: { ...baseOpenGraph, title: `${title} · SplitSnap`, description, url: "/split" },
  twitter: { ...baseTwitter, title: `${title} · SplitSnap`, description },
};

export default function SplitPage() {
  return <SplitApp />;
}
