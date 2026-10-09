import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { CONTACT_EMAIL, baseOpenGraph, baseTwitter } from "@/lib/site";

const description = "The terms for using SplitSnap: a free bill-splitting calculator that never holds or moves money.";

export const metadata: Metadata = {
  title: "Terms",
  description,
  alternates: { canonical: "/terms" },
  openGraph: { ...baseOpenGraph, title: "Terms · SplitSnap", description, url: "/terms" },
  twitter: { ...baseTwitter, title: "Terms · SplitSnap", description },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 9, 2026"
      intro="SplitSnap is a free calculator for splitting a shared bill. By using it you agree to these terms."
    >
      <section>
        <h2>We never hold or move money</h2>
        <p>
          SplitSnap only does the math. Pay buttons open Venmo, PayPal or Cash App with an amount filled in; you
          review and send the payment inside that app. We can&apos;t see, verify, reverse or refund payments.
        </p>
      </section>
      <section>
        <h2>Check the numbers</h2>
        <p>
          Receipt scanning uses AI and can make mistakes. You&apos;re responsible for reviewing items and totals
          before asking anyone to pay. SplitSnap is not financial, tax or legal advice.
        </p>
      </section>
      <section>
        <h2>Not affiliated</h2>
        <p>
          SplitSnap is not affiliated with, endorsed by, or sponsored by Venmo, PayPal, Cash App, Block, Google or
          Splitwise. Their names are trademarks of their owners and are used only to describe compatibility.
        </p>
      </section>
      <section>
        <h2>Fair use</h2>
        <ul>
          <li>Don&apos;t abuse the service (for example, automated scanning or trying to break it).</li>
          <li>We may limit scans per person to keep the free service running for everyone.</li>
        </ul>
      </section>
      <section>
        <h2>Provided as-is</h2>
        <p>
          SplitSnap is provided “as is”, without warranties of any kind. To the extent the law allows, we&apos;re
          not liable for losses from using it, including incorrect amounts or payments sent to the wrong person.
        </p>
      </section>
      <section>
        <h2>Privacy and contact</h2>
        <p>
          See our <Link className="font-medium text-brand underline" href="/privacy">privacy policy</Link>. Questions:{" "}
          <a className="font-medium text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
