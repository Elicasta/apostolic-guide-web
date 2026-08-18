import type { Viewport } from "next";
import "../carousel-studio-master.css";
import "../carousel-final-stability.css";
import "../carousel-manual-edit.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function CarouselStudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
