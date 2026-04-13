import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get("title") || "Minerva Reader";
  const author = searchParams.get("author") || "";
  const type = searchParams.get("type") || "default";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #f5f0e8 0%, #e8e0d0 100%)",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top bar accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: "linear-gradient(90deg, #8b6914 0%, #c4960a 50%, #8b6914 100%)",
          }}
        />

        {/* Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "80px",
            height: "80px",
            borderRadius: "20px",
            background: "#1a1510",
            marginBottom: "32px",
            fontSize: "40px",
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3L4 7v10l8 4 8-4V7l-8-4z"
              stroke="#c4960a"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M12 7l-4 2v6l4 2 4-2V9l-4-2z" fill="#c4960a" opacity="0.3" />
          </svg>
        </div>

        {/* Type label */}
        {type !== "default" && (
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#8b6914",
              textTransform: "uppercase",
              letterSpacing: "3px",
              marginBottom: "16px",
            }}
          >
            {type === "book" ? "Read Online" : "Curated Collection"}
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 40 ? "42px" : "52px",
            fontWeight: 700,
            color: "#1a1510",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "900px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>

        {/* Author */}
        {author && (
          <div
            style={{
              fontSize: "28px",
              fontWeight: 400,
              color: "#5c5040",
              marginTop: "16px",
              textAlign: "center",
            }}
          >
            by {author}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "22px",
            fontWeight: 600,
            color: "#8b6914",
          }}
        >
          Minerva Reader
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
