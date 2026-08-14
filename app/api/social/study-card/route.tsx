import { ImageResponse } from "next/og";

export const runtime = "edge";

function cleanTitle(value: string | null) {
  const title = (value || "Apostolic Guide Study").replace(/[^a-zA-Z0-9:'’&?.! -]/g, " ").replace(/\s+/g, " ").trim();
  return title.slice(0, 72) || "Apostolic Guide Study";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const title = cleanTitle(url.searchParams.get("title"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F5F7F4",
          color: "#10202A",
          padding: "56px 64px 52px",
          border: "18px solid #10202A",
          position: "relative"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div style={{ display: "flex", fontSize: "34px", fontWeight: 900, letterSpacing: "-2px" }}>
              A<span style={{ color: "#A12D3D" }}>G</span>
            </div>
            <div style={{ display: "flex", fontSize: "22px", fontWeight: 800, letterSpacing: "5px", textTransform: "uppercase" }}>
              Apostolic Guide
            </div>
          </div>
          <div style={{ display: "flex", fontSize: "16px", fontWeight: 800, letterSpacing: "4px", textTransform: "uppercase", color: "#15566A" }}>
            Scripture · Study · Understand
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxWidth: "980px" }}>
          <div style={{ display: "flex", fontSize: "18px", fontWeight: 900, letterSpacing: "5px", textTransform: "uppercase", color: "#A12D3D" }}>
            You found the study.
          </div>
          <div style={{ display: "flex", fontSize: title.length > 42 ? "62px" : "78px", lineHeight: 0.98, fontWeight: 900, letterSpacing: "-3px" }}>
            {title}
          </div>
          <div style={{ display: "flex", width: "150px", height: "8px", background: "#A12D3D" }} />
          <div style={{ display: "flex", fontSize: "25px", lineHeight: 1.35, color: "#263A44" }}>
            Follow the Scripture. See the connections. Know what you believe and why.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: "18px", fontWeight: 800 }}>apostolicguide.com</div>
          <div style={{ display: "flex", width: "300px", height: "3px", background: "#15566A" }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
