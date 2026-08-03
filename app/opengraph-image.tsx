import { ImageResponse } from "next/og";

export const alt = "Apostolic Guide. Know what you believe. See it in Scripture.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 72,
      color: "#f5f7f4",
      background: "#10202a"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #f5f7f4", borderRadius: 12, fontSize: 25, fontWeight: 900 }}>A</div>
        <div style={{ fontSize: 29, fontWeight: 800, letterSpacing: -1 }}>APOSTOLIC GUIDE</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ color: "#e099a3", fontSize: 22, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase" }}>Scripture · Doctrine · Answers</div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 960, fontSize: 79, lineHeight: 0.96, fontWeight: 900, letterSpacing: -5 }}>
          <div>Know what you believe.</div>
          <div>See it in Scripture.</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb0b6", fontSize: 22 }}>
        <span>apostolicguide.com</span><span>One God. Jesus Christ. The apostolic faith.</span>
      </div>
    </div>,
    size
  );
}
