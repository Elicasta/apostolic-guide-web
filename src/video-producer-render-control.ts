export type VideoProducerRenderStatus = "queued" | "rendering" | "completed" | "failed";

export type VideoProducerRenderControl = {
  action: "restart" | "retry" | "rerender";
  label: "RESTART RENDER" | "RETRY RENDER" | "RENDER AGAIN";
  description: string;
  force: boolean;
};

export function videoProducerRenderControl(
  projectStatus: string,
  latestRenderStatus: VideoProducerRenderStatus | null | undefined,
  hasApprovedEdit: boolean
): VideoProducerRenderControl | null {
  if (!hasApprovedEdit) return null;

  if (latestRenderStatus === "queued" || latestRenderStatus === "rendering") {
    return {
      action: "restart",
      label: "RESTART RENDER",
      description: "Stop trusting the current worker and start a fresh FFmpeg render from the same approved edit.",
      force: true
    };
  }

  if (latestRenderStatus === "failed") {
    return {
      action: "retry",
      label: "RETRY RENDER",
      description: "Retry only the final render. The source upload, transcript, Sol plan and approval stay intact.",
      force: false
    };
  }

  if (latestRenderStatus === "completed" && ["review", "completed"].includes(projectStatus)) {
    return {
      action: "rerender",
      label: "RENDER AGAIN",
      description: "Create another review master from the same approved edit without rebuilding the project.",
      force: false
    };
  }

  return null;
}
