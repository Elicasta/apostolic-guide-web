import { ImageResponse } from "next/og";

export const alt = "Amang’ana a Nyasae. Ekegusii Bible Studies — Apostolic Guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// This image belongs only to the Ekegusii edition. It is intentionally distinct
// from app/opengraph-image.tsx, used by the English Apostolic Guide site.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{
        display: "flex", position: "relative", width: "100%", height: "100%",
        overflow: "hidden", background: "#193238", color: "#f8f3e7",
        padding: "54px 64px", fontFamily: "Georgia, serif",
      }}>
        <div style={{
          display: "flex", position: "absolute", left: -155, top: 180,
          width: 480, height: 480, borderRadius: 480,
          border: "1px solid rgba(225,190,141,0.12)",
        }}/>
        <div style={{
          display: "flex", position: "absolute", left: -105, top: 230,
          width: 380, height: 380, borderRadius: 380,
          border: "1px solid rgba(225,190,141,0.10)",
        }}/>
        <div style={{
          display: "flex", position: "absolute", top: -140, right: -190,
          width: 630, height: 630, borderRadius: 630,
          background: "rgba(220,185,132,0.055)",
        }}/>
        <div style={{
          display: "flex", flexDirection: "column", position: "relative", zIndex: 2,
          width: "73%", height: "100%",
        }}>
          <div style={{
            display: "flex", alignItems: "center", width: "100%",
            paddingBottom: 20, borderBottom: "1px solid rgba(247,243,231,.22)",
            fontFamily: "Arial, sans-serif",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid #dcbb88", borderRadius: 5, height: 35, width: 35,
              color: "#e7c99a", fontWeight: 800, fontSize: 21,
            }}>A</div>
            <div style={{
              display: "flex", marginLeft: 13, letterSpacing: 2.2,
              fontSize: 18, fontWeight: 700,
            }}>APOSTOLIC GUIDE</div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", marginTop: 62,
            color: "#e9c58f", fontFamily: "Arial, sans-serif", fontSize: 17,
            fontWeight: 800, letterSpacing: 3.1,
          }}>
            <span style={{ display: "flex", width: 32, height: 2, background: "#e9c58f", marginRight: 15 }}/>
            EKEGUSII BIBLE STUDY EDITION
          </div>
          <div style={{
            display: "flex", marginTop: 22, fontSize: 70,
            fontWeight: 700, lineHeight: 1.06, letterSpacing: -1.4,
            whiteSpace: "nowrap",
          }}>Amang’ana a Nyasae.</div>
          <div style={{
            display: "flex", fontSize: 47, fontWeight: 700, fontStyle: "italic",
            color: "#eac28c", marginTop: 3,
          }}>Ekegusii.</div>
          <div style={{
            display: "flex", marginTop: 28, fontFamily: "Arial, sans-serif",
            fontSize: 23, lineHeight: 1.4, color: "#d7e0da",
          }}>20 teaching Pathways · 106 Scripture steps</div>
          <div style={{
            display: "flex", marginTop: "auto", alignItems: "center",
            fontFamily: "Arial, sans-serif", fontSize: 17,
            letterSpacing: 0.3, color: "#c4d0c8",
          }}>apostolicguide.com/ekegusii</div>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", width: "27%",
          alignItems: "flex-end", justifyContent: "center",
          position: "relative", zIndex: 2,
        }}>
          <div style={{
            display: "flex", width: 226, height: 298, borderRadius: 9,
            border: "1px solid rgba(234,194,140,.55)", background: "#263e42",
            padding: 20, flexDirection: "column",
          }}>
            <div style={{
              display: "flex", fontSize: 13, fontWeight: 700,
              letterSpacing: 2, color: "#e7c48e", fontFamily: "Arial, sans-serif",
            }}>EBIBILIA ENCHENU</div>
            <div style={{
              display: "flex", width: 115, height: 1, marginTop: 19,
              background: "rgba(234,194,140,.4)",
            }}/>
            <div style={{
              display: "flex", marginTop: 27, fontSize: 80, fontWeight: 700,
              color: "#f8f3e7",
            }}>20</div>
            <div style={{
              display: "flex", marginTop: -4, fontSize: 18, letterSpacing: 2,
              fontWeight: 800, color: "#e4c89d", fontFamily: "Arial, sans-serif",
            }}>PATHWAYS</div>
            <div style={{
              display: "flex", marginTop: "auto", paddingTop: 12,
              borderTop: "1px solid rgba(234,194,140,.35)",
              fontSize: 15, color: "#dce6dd", fontFamily: "Arial, sans-serif",
            }}>Draft translation</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
