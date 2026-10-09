// Landing-page FAQ. Plain text so the same answers feed the page and FAQPage JSON-LD.

export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Is SplitSnap free?",
    a: "Yes. Scanning receipts, splitting by item, and pay links are all free. There's no paid tier and no ads.",
  },
  {
    q: "Do my friends need an account?",
    a: "No. Nobody needs to sign up or download anything. You add names at the table, and everyone pays you with the app they already use.",
  },
  {
    q: "How does receipt scanning work, and what happens to my photo?",
    a: "Your photo is shrunk on your phone, then sent to Google Gemini, which reads the line items, tax and tip. We don't store the photo. Because we use Gemini's free tier, Google may use inputs to improve its products, so don't scan anything sensitive. You can always type items in by hand instead.",
  },
  {
    q: "Does SplitSnap handle my money?",
    a: "Never. SplitSnap only does the math. Pay buttons open Venmo, PayPal or Cash App with the amount filled in, and you confirm the payment there. We're not affiliated with any of them.",
  },
  {
    q: "How are tax and tip split?",
    a: "In proportion to what each person ordered: if your items are 30% of the subtotal, you pay 30% of the tax and tip. Shared items split evenly between whoever claimed them, and every cent is accounted for so the totals add up exactly to the bill.",
  },
];

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};
