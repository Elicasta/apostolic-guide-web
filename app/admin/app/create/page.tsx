import Link from "next/link";
import { FileText, Film, Headphones, Layers3, MessageCircle, Sparkles } from "lucide-react";

const studios = [
  { href: "/admin/carousel-studio", title: "Carousel", detail: "Posts, carousels, singles", icon: Layers3 },
  { href: "/admin/threads-studio", title: "Threads", detail: "Threads and text posts", icon: MessageCircle },
  { href: "/admin/episode-studio", title: "Episode", detail: "Scripts and episode prep", icon: FileText },
  { href: "/admin/audio", title: "Audio", detail: "Pathway voice and audio", icon: Headphones },
  { href: "/admin/video-producer", title: "Video Producer", detail: "AI production pipeline", icon: Sparkles },
  { href: "/admin/video-studio", title: "Video Studio", detail: "Edit, review, render", icon: Film }
];

export default function StudioAppCreatePage() {
  return <main className="studio-app-create">
    <header className="studio-app-create-head"><span>Create</span><h1>Choose a studio</h1><p>Start with the format. Each tool keeps the same Pathway and publishing system behind it.</p></header>
    <section className="studio-app-create-grid">
      {studios.map((studio) => {
        const Icon = studio.icon;
        return <Link href={studio.href} key={studio.href}><i><Icon size={22}/></i><strong>{studio.title}</strong><span>{studio.detail}</span></Link>;
      })}
    </section>
  </main>;
}
