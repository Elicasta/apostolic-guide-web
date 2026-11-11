/** Human-readable GitHub bridge diagnostics. Never include a bearer token in an error. */
export const VIDEO_PRODUCER_GITHUB_TOKEN_ENV = "VIDEO_STUDIO_GITHUB_TOKEN";
export const VIDEO_PRODUCER_GITHUB_TOKEN_FALLBACK = "analytics.integration_secrets.video_studio_github_token";
export const VIDEO_PRODUCER_TRANSCRIPTION_SECRET = "VIDEO_PRODUCER_OPENAI_API_KEY";

export type GitHubWorkerOperation = "repository" | "dispatcher" | "dispatch" | "secrets";
export function githubWorkerDiagnostic(status: number, operation: GitHubWorkerOperation, repository: string): string {
  const token = `${VIDEO_PRODUCER_GITHUB_TOKEN_ENV} (or encrypted ${VIDEO_PRODUCER_GITHUB_TOKEN_FALLBACK})`;
  if (status === 401) return `GitHub returned 401 Bad credentials. Replace the expired, revoked, or invalid ${token}. A 401 is an authentication failure, not proof that a workflow or transcription secret is missing.`;
  if (status === 403) {
    if (operation === "secrets") return `GitHub returned 403 while inspecting Actions secrets. The worker token needs repository Secrets: read permission to list names; this is only a diagnostic check. Ensure the separate GitHub Actions secret ${VIDEO_PRODUCER_TRANSCRIPTION_SECRET} exists.`;
    if (operation === "dispatch") return `GitHub returned 403 while starting the worker in ${repository}. Grant ${token} repository Contents: write permission (fine-grained PAT), ensure SSO authorization where required, and confirm Actions are enabled.`;
    return `GitHub returned 403 for ${repository}. Grant ${token} repository Metadata: read and Contents: read permission; worker dispatch also requires Contents: write.`;
  }
  if (status === 404) {
    if (operation === "dispatcher") return `Dispatcher .github/workflows/video-producer-dispatch.yml is not accessible on main in ${repository}. Confirm it exists, the token can read repository Contents, and the repository selector is correct.`;
    if (operation === "dispatch") return `Repository dispatch returned 404 for ${repository}. Check VIDEO_STUDIO_GITHUB_REPOSITORY and token access to that repository, including Contents: write.`;
    return `GitHub returned 404 for ${repository}. Check VIDEO_STUDIO_GITHUB_REPOSITORY and access to the selected repository.`;
  }
  if (status === 429) return "GitHub API rate limit reached. Retry after the rate limit resets.";
  return `GitHub ${operation} check failed with HTTP ${status}. Verify the worker token and GitHub Actions permissions.`;
}
