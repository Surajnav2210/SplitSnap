import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { CONTACT_EMAIL, baseOpenGraph, baseTwitter } from "@/lib/site";

const description = "What SplitSnap collects (almost nothing), how receipt photos are handled, and who sees your data.";

export const metadata: Metadata = {
  title: "Privacy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { ...baseOpenGraph, title: "Privacy · SplitSnap", description, url: "/privacy" },
  twitter: { ...baseTwitter, title: "Privacy · SplitSnap", description },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="October 9, 2026"
      intro="Short version: SplitSnap doesn't keep your bills, doesn't sell data, and doesn't show ads."
    >
      <section>
        <h2>What we store</h2>
        <p>
          Right now, nothing on our servers. The bill you build (items, names, amounts and payment handles)
          lives in your browser tab and disappears when you close it or tap “Start over”. There are no accounts.
        </p>
      </section>
      <section>
        <h2>Receipt photos</h2>
        <ul>
          <li>Before upload, your phone shrinks the photo to make it smaller and faster to send.</li>
          <li>The photo is sent to Google Gemini, which reads the line items, tax and tip, and sends them back.</li>
          <li>We don&apos;t save the photo. It is used for that one request and then discarded.</li>
          <li>
            We use Gemini&apos;s free tier, under which Google may use inputs to improve its products. Please
            don&apos;t scan receipts with information you consider sensitive. You can always type items by hand.
          </li>
        </ul>
      </section>
      <section>
        <h2>Payment handles</h2>
        <p>
          Venmo, PayPal and Cash App handles you enter are only used to build pay links on your screen. Tapping a
          pay button opens that app; what happens there is covered by its own privacy policy.
        </p>
      </section>
      <section>
        <h2>What we never do</h2>
        <ul>
          <li>Sell or rent your data.</li>
          <li>Show ads or use advertising trackers.</li>
          <li>Ask for card numbers or bank details.</li>
        </ul>
      </section>
      <section>
        <h2>Basic server logs</h2>
        <p>
          Our host keeps standard technical logs (like IP address and time of request) to keep the service
          running and to stop abuse, such as limiting how many receipts can be scanned.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions? Email <a className="font-medium text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
