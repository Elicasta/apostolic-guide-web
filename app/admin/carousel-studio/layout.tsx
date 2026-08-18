import type { Viewport } from "next";
import "../carousel-studio-master.css";
import "../carousel-final-stability.css";
import "../carousel-manual-edit.css";
import "../carousel-single-sol-art.css";
import "../carousel-mobile-edit-v2.css";
import "../carousel-manual-restore.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function CarouselStudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
