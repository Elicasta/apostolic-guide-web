import "./review.css";
import { SolRuntimeReviewClient } from "@/sol-runtime-review-client";

export default async function SolRuntimeReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return <SolRuntimeReviewClient reviewId={reviewId}/>;
}
