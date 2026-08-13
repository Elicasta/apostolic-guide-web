import { MediaPublishingOverviewPortal } from "@/media-publishing-overview";
import "../media-publishing-overview.css";

export default function PublishingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<MediaPublishingOverviewPortal/></>;
}
