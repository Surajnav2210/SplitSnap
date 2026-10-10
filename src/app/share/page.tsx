import type { Metadata } from "next";
import { PublishScreen } from "@/features/live/PublishScreen";

export const metadata: Metadata = {
  title: "Share with the table",
  robots: { index: false, follow: false },
};

export default function SharePage() {
  return <PublishScreen />;
}
