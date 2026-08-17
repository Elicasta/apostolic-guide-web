import { FileText, Film, Images, Smartphone } from "lucide-react";
import Link from "next/link";
import styles from "./video-producer-library.module.css";

export type VideoProducerSection = "projects" | "episodes" | "reels" | "graphics";

const items = [
  { id: "projects" as const, label: "Projects", href: "/admin/video-producer", icon: Film },
  { id: "episodes" as const, label: "Episodes", href: "/admin/video-producer/episodes", icon: FileText },
  { id: "reels" as const, label: "Reels", href: "/admin/video-producer/reels", icon: Smartphone },
  { id: "graphics" as const, label: "Graphics", href: "/admin/video-producer/graphics", icon: Images }
];

export function VideoProducerSectionNav({ active }: { active: VideoProducerSection }) {
  return (
    <nav className={styles.sectionNav} aria-label="Video Producer sections">
      {items.map((item) => {
        const Icon = item.icon;
        return <Link key={item.id} href={item.href} data-active={active === item.id}><Icon size={15}/>{item.label}</Link>;
      })}
    </nav>
  );
}
