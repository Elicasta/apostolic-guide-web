export async function GET() {
  return new Response(JSON.stringify({
    id: "/admin/",
    name: "Apostolic Guide Studio",
    short_name: "AG Studio",
    description: "Apostolic Guide publishing and studio workspace.",
    start_url: "/admin/app",
    scope: "/admin/",
    display: "standalone",
    background_color: "#f6f7f7",
    theme_color: "#f6f7f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  }), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
