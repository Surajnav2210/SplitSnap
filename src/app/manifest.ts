import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Split the bill`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/split",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#0c0a09",
    categories: ["finance", "food", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
