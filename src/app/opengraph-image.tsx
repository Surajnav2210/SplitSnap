import { ImageResponse } from "next/og";

export const alt = "SplitSnap: split the bill before the waiter comes back. Snap the receipt, tap what you had, pay in one tap.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LINES: { name: string; price: string; dots: string[] }[] = [
  { name: "Truffle fries", price: "$12.00", dots: ["#10b981", "#0ea5e9", "#8b5cf6"] },
  { name: "Margherita pizza", price: "$18.50", dots: ["#10b981"] },
  { name: "Smash burger", price: "$17.25", dots: ["#0ea5e9"] },
  { name: "Draft IPA ×3", price: "$21.00", dots: ["#8b5cf6", "#f43f5e"] },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #047857 0%, #059669 55%, #10b981 100%)",
          color: "white",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669", fontSize: 30 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
                <path d="M9 9h6M9 13h6" />
              </svg>
            </div>
            SplitSnap
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 640 }}>
              Split the bill before the waiter comes back.
            </div>
            <div style={{ fontSize: 28, marginTop: 24, opacity: 0.9 }}>
              Snap the receipt · Tap what you had · Pay in one tap
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, opacity: 0.8 }}>Free · No sign-up · Never holds your money</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 380 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 340,
              background: "#fffdf8",
              color: "#1c1a17",
              borderRadius: 12,
              padding: "32px 28px",
              transform: "rotate(3deg)",
              boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", fontSize: 18, letterSpacing: 4, opacity: 0.6 }}>CORNER BISTRO</div>
            <div style={{ display: "flex", borderTop: "2px dashed rgba(0,0,0,0.25)", margin: "18px 0" }} />
            {LINES.map((l) => (
              <div key={l.name} style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}>
                  <span>{l.name}</span>
                  <span>{l.price}</span>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {l.dots.map((c, i) => (
                    <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: c, display: "flex" }} />
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", borderTop: "2px solid rgba(0,0,0,0.8)", marginTop: 6, paddingTop: 12, justifyContent: "space-between", fontSize: 24, fontWeight: 800 }}>
              <span>TOTAL</span>
              <span>$107.70</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
