import { MediaPublishingOverviewPortal } from "@/media-publishing-overview";
import { PublishingRouteIntent } from "@/publishing-route-intent";
import "../media-publishing-overview.css";

export default function PublishingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<MediaPublishingOverviewPortal/><PublishingRouteIntent/></>;
}
