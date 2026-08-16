import { redirect } from "next/navigation";
import { SolRuntimeReviewClient } from "@/sol-runtime-review-client";
import { getSolRuntimeReview } from "@/sol-runtime-review";

function withReviewContext(route: string, reviewId: string, artifactId: string) {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}solReview=${encodeURIComponent(reviewId)}&artifact=${encodeURIComponent(artifactId)}`;
}

export default async function SolRuntimeReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const review = await getSolRuntimeReview(reviewId).catch(() => null);
  if (review?.artifact?.location) redirect(withReviewContext(review.artifact.location, review.id, review.artifact.id));
  return <SolRuntimeReviewClient reviewId={reviewId}/>;
}
