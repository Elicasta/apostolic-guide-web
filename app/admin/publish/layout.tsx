import { InstagramCarouselCaptionSuite } from "@/instagram-carousel-caption-suite";
import { InstagramPublishingWorkflow } from "@/instagram-publishing-workflow";
import { MediaPublishingOverviewPortal } from "@/media-publishing-overview";
import { PublishingRouteIntent } from "@/publishing-route-intent";
import "../media-publishing-overview.css";
import "../instagram-caption-suite.css";

export default function PublishingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<MediaPublishingOverviewPortal/><InstagramPublishingWorkflow/><InstagramCarouselCaptionSuite/><PublishingRouteIntent/></>;
}
