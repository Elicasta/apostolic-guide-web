import { InstagramCarouselCaptionSuite } from "@/instagram-carousel-caption-suite";
import { InstagramPublishingWorkflow } from "@/instagram-publishing-workflow";
import { MediaPublishingOverviewPortal } from "@/media-publishing-overview";
import { PublishingRouteIntent } from "@/publishing-route-intent";
import { ThreadsSingleComposer } from "@/threads-single-composer";
import { ThreadsPublishingSuite } from "@/threads-publishing-suite";
import "../media-publishing-overview.css";
import "../instagram-caption-suite.css";
import "../threads-publishing.css";

export default function PublishingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<section className="threads-single-standalone admin-card"><ThreadsSingleComposer/></section><ThreadsPublishingSuite/><MediaPublishingOverviewPortal/><InstagramPublishingWorkflow/><InstagramCarouselCaptionSuite/><PublishingRouteIntent/></>;
}
