import { ImageResponse } from "next/og";

export const alt = "Apostolic Guide. Know what you believe. Know why.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        padding: "54px 58px",
        color: "#10202a",
        background: "#f5f0e7"
      }}
    >
      {/* Editorial grid */}
      {[120, 240, 360, 480].map((top) => (
        <div
          key={`h-${top}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top,
            height: 1,
            background: "rgba(16,32,42,.055)"
          }}
        />
      ))}
      {[180, 360, 540, 720, 900, 1080].map((left) => (
        <div
          key={`v-${left}`}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left,
            width: 1,
            background: "rgba(16,32,42,.055)"
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: -94,
          display: "flex",
          color: "rgba(16,32,42,.035)",
          fontSize: 330,
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: -30
        }}
      >
        AG
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "59%",
          height: "100%",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 16,
            borderBottom: "1px solid rgba(16,32,42,.18)",
            color: "#66777c",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 2.2,
            textTransform: "uppercase"
          }}
        >
          <span>Scripture · Doctrine · Answers</span>
          <span>Search · Study · Understand</span>
        </div>

        <div
          style={{
            marginTop: 46,
            display: "flex",
            alignItems: "center",
            color: "#a93246",
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: 2.3,
            textTransform: "uppercase"
          }}
        >
          <span style={{ width: 34, height: 2, marginRight: 12, background: "#a93246" }} />
          Scripture first. Questions welcome.
        </div>

        <div
          style={{
            marginTop: 25,
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            lineHeight: .87,
            fontWeight: 900,
            letterSpacing: -5.5
          }}
        >
          <span>Know what you believe.</span>
          <span style={{ color: "#a93246" }}>Know why.</span>
        </div>

        <div
          style={{
            marginTop: 30,
            maxWidth: 610,
            color: "#5d6d72",
            fontSize: 20,
            lineHeight: 1.45
          }}
        >
          Search Scripture, follow connected passages, and understand Apostolic doctrine from the text itself.
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            color: "#68797e",
            fontSize: 15,
            fontWeight: 700
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              marginRight: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid #10202a",
              borderRadius: 7,
              color: "#10202a",
              fontSize: 15,
              fontWeight: 900
            }}
          >
            A
          </span>
          apostolicguide.com
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "37%",
          height: "100%",
          marginLeft: "4%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 24,
          color: "#ffffff",
          background: "#101a20",
          boxShadow: "0 24px 54px rgba(16,32,42,.18)"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid rgba(255,255,255,.12)",
            color: "#8fa0a5",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: "uppercase"
          }}
        >
          <span>Scripture guide</span>
          <span>Connected study</span>
        </div>

        <div
          style={{
            margin: "18px 18px 14px",
            padding: "15px 16px",
            display: "flex",
            alignItems: "center",
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 13,
            color: "#dce4e6",
            background: "rgba(255,255,255,.055)",
            fontSize: 15
          }}
        >
          <span style={{ marginRight: 11, color: "#ef9daa", fontWeight: 900 }}>⌕</span>
          <span>Why did Jesus pray?</span>
          <span style={{ marginLeft: "auto", color: "#ef9daa", fontWeight: 900 }}>↵</span>
        </div>

        <div
          style={{
            margin: "0 18px 14px",
            padding: 21,
            display: "flex",
            flexDirection: "column",
            borderRadius: 15,
            color: "#10202a",
            background: "#f5f0e7"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "#a93246",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.3,
              textTransform: "uppercase"
            }}
          >
            <span>Best match</span>
            <span>John 14:9–11</span>
          </div>
          <div style={{ marginTop: 23, fontSize: 27, lineHeight: 1, fontWeight: 900, letterSpacing: -1.4 }}>
            The Father is revealed in Jesus Christ.
          </div>
          <div style={{ marginTop: 16, color: "#5d6d72", fontSize: 15, lineHeight: 1.4 }}>
            Follow the passage, context, and connected evidence.
          </div>
          <div style={{ marginTop: 20, color: "#a93246", fontSize: 13, fontWeight: 850 }}>
            Open passage →
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: "17px 20px",
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,.12)",
            color: "#8fa0a5",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.25,
            textTransform: "uppercase"
          }}
        >
          <span>Follow the evidence</span>
          <span>AG</span>
        </div>
      </div>
    </div>,
    size
  );
}
