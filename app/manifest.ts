import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Apostolic Guide",
    short_name: "Apostolic Guide",
    description: "A Scripture-first library about the one God, Jesus Christ, salvation, and the apostolic faith.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f4",
    theme_color: "#10202a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
