import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { CONTACT_EMAIL, baseOpenGraph, baseTwitter } from "@/lib/site";

const description = "What SplitSnap stores for shared bills, how receipt photos are handled, and who sees your data.";

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
      updated="October 10, 2026"
      intro="Short version: solo bills never leave your browser. Shared bills are kept for 30 days so your table can settle up. We don't sell data or show ads."
    >
      <section>
        <h2>Splitting on your own phone</h2>
        <p>
          When you split a bill by yourself, nothing is stored on our servers. The bill you build (items, names, amounts
          and payment handles) lives in your browser tab and disappears when you close it or tap “Start over”. No account
          is needed.
        </p>
      </section>
      <section>
        <h2>Shared bills (“Share with the table”)</h2>
        <p>If you share a live link, we store what the table needs to settle up:</p>
        <ul>
          <li>The restaurant name, items, prices, tax, tip, fees and discounts.</li>
          <li>The names people type when they join, and which items each person tapped.</li>
          <li>What each person owes once the bill is locked, and whether they marked it paid.</li>
          <li>
            The host&apos;s Venmo, PayPal and Cash App handles, saved to their profile and copied onto the bill when it
            is locked so guests get the right pay buttons.
          </li>
        </ul>
        <p>
          Hosts sign in with Google; we receive their name and email address from Google for sign-in only. Guests
          don&apos;t create an account: their browser gets an anonymous session so the app recognizes the same phone,
          without an email or password. Everyone on a bill can see the other names and claims on it. Only the host sees
          everyone&apos;s payment status.
        </p>
        <p>
          A shared bill is archived 30 days after it&apos;s locked (or 30 days after it was created, if it never is).
          Archived bills stop working for guests, and guest names on them are replaced with “Guest 1”, “Guest 2” and so on.
          Changes to amounts and payment status are kept in an audit log so mistakes can be traced.
        </p>
        <p>Shared bill links are private and aren&apos;t listed in search engines. Anyone with the link can join while the bill is open, so share it only with your table.</p>
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
          Venmo, PayPal and Cash App handles are only used to build pay links. On a solo bill they stay on your screen;
          on a shared bill they are stored as described above. Tapping a pay button opens that app; what happens there
          is covered by its own privacy policy.
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
