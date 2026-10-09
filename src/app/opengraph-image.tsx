import { ImageResponse } from "next/og";

export const alt = "SplitSnap: split the bill before the waiter comes back. Snap the receipt, tap what you had, pay in one tap.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0c0a09";
const MUTED = "#78716c";
const BORDER = "#e7e5e4";
const ACCENT = "#2563eb";

// Avatar tones from globals.css (light theme).
const AV = [
  { bg: "#dde3ec", fg: "#344256" },
  { bg: "#dce6dc", fg: "#33513a" },
  { bg: "#eedfd8", fg: "#73402f" },
  { bg: "#ece4d2", fg: "#62502b" },
];

const LINES: { name: string; price: string; by: { i: string; t: number }[] }[] = [
  { name: "Truffle fries", price: "12.00", by: [{ i: "A", t: 0 }, { i: "S", t: 1 }, { i: "P", t: 2 }] },
  { name: "Margherita pizza", price: "18.50", by: [{ i: "A", t: 0 }] },
  { name: "Smash burger", price: "17.25", by: [{ i: "S", t: 1 }] },
  { name: "3× Draft IPA", price: "21.00", by: [{ i: "S", t: 1 }, { i: "P", t: 2 }] },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fafaf9", color: INK, padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600, letterSpacing: -1 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: INK, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 3.5h11v17l-1.84-1.2-1.83 1.2L12 19.3l-1.83 1.2-1.83-1.2-1.84 1.2z" />
                <path d="M12 7v9" />
              </svg>
            </div>
            SplitSnap
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 70, fontWeight: 600, lineHeight: 1.04, letterSpacing: -2.8, maxWidth: 620 }}>
              Split the bill before the waiter comes back.
            </div>
            <div style={{ fontSize: 26, marginTop: 24, color: MUTED }}>Snap the receipt · Tap what you had · Pay in one tap</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: MUTED }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: ACCENT, display: "flex" }} />
            Free · No sign-up for friends · Never holds your money
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 400 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 360,
              background: "#ffffff",
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: "30px 28px",
              fontFamily: "monospace",
              boxShadow: "0 24px 48px -24px rgba(12,10,9,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", fontSize: 16, letterSpacing: 4 }}>CORNER BISTRO</div>
            <div style={{ display: "flex", borderTop: `2px dashed ${BORDER}`, margin: "18px 0" }} />
            {LINES.map((l) => (
              <div key={l.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, fontSize: 18 }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span>{l.name}</span>
                  <div style={{ display: "flex", marginTop: 6 }}>
                    {l.by.map((p, k) => (
                      <div
                        key={k}
                        style={{ width: 22, height: 22, borderRadius: 11, marginRight: 4, background: AV[p.t].bg, color: AV[p.t].fg, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}
                      >
                        {p.i}
                      </div>
                    ))}
                  </div>
                </div>
                <span>{l.price}</span>
              </div>
            ))}
            <div style={{ display: "flex", borderTop: `2px dashed ${BORDER}`, marginTop: 4, paddingTop: 14, justifyContent: "space-between", fontSize: 22, fontWeight: 700 }}>
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
