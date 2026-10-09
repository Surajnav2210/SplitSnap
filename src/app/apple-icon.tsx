import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0a09" }}>
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 3.5h11v17l-1.84-1.2-1.83 1.2L12 19.3l-1.83 1.2-1.83-1.2-1.84 1.2z" />
          <path d="M12 7v9" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
