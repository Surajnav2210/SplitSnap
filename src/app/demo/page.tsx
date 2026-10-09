import { permanentRedirect } from "next/navigation";

// The old /demo now lives at /split.
export default function DemoPage() {
  permanentRedirect("/split");
}
