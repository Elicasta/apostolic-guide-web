import type { SolVerifier } from "./registry";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const verifyNonEmptyText: SolVerifier = async (value) => {
  const row = object(value);
  const text = typeof row.text === "string" ? row.text.trim() : "";
  return text ? { passed: true, observations: { chars: text.length } } : { passed: false, code: "VERIFICATION_FAILURE", message: "Expected non-empty generated text." };
};

export const verifyBrowserAssertions: SolVerifier = async (value) => {
  const row = object(value);
  const passed = row.passed === true;
  return passed ? { passed: true, observations: { status: row.status, assertions: row.assertions } } : { passed: false, code: "VERIFICATION_FAILURE", message: "One or more browser assertions failed.", observations: { status: row.status, assertions: row.assertions } };
};

export const verifyGithubSuccess: SolVerifier = async (value) => {
  const row = object(value);
  return row.state === "success" ? { passed: true, observations: { sha: row.sha, statuses: row.statuses } } : { passed: false, code: row.state === "pending" ? "DEPENDENCY_FAILURE" : "VERIFICATION_FAILURE", message: `GitHub combined status is ${String(row.state || "unknown")}.`, observations: { sha: row.sha, statuses: row.statuses } };
};

export const verifyDeploymentReady: SolVerifier = async (value) => {
  const row = object(value);
  return row.passed === true ? { passed: true, observations: { state: row.state, httpStatus: row.httpStatus, url: row.url } } : { passed: false, code: row.ready === false ? "DEPENDENCY_FAILURE" : "VERIFICATION_FAILURE", message: row.ready === false ? "Deployment is not READY yet." : `Deployment HTTP verification failed with ${String(row.httpStatus ?? "no status")}.`, observations: { state: row.state, httpStatus: row.httpStatus, url: row.url } };
};

export const verifyCarouselRender: SolVerifier = async (value) => {
  const row = object(value);
  const slides = Array.isArray(row.slides) ? row.slides : [];
  const width = Number(row.width);
  const height = Number(row.height);
  const expected = Number(row.slideCount);
  const passed = expected >= 4 && slides.length === expected && width === 1080 && height === 1350 && slides.every((slide) => Boolean(object(slide).id && object(slide).route));
  return passed ? { passed: true, observations: { slideCount: slides.length, width, height } } : { passed: false, code: "VERIFICATION_FAILURE", message: "Carousel render is missing slides, routes, or expected 1080×1350 dimensions.", observations: { slideCount: slides.length, expected, width, height } };
};

export const verifyDoctrinePassed: SolVerifier = async (value) => {
  const row = object(value);
  const status = String(row.status || "blocked");
  if (status === "pass") return { passed: true, observations: { doctrineStatus: status, sourceRefs: row.sourceRefs } };
  return { passed: false, code: "CONTENT_FAILURE", message: status === "warning" ? "Doctrine checker returned a warning that requires repair or review." : "Doctrine checker blocked the generated content.", observations: { doctrineStatus: status, issues: row.issues, sourceRefs: row.sourceRefs } };
};

export const verifyLinksPassed: SolVerifier = async (value) => {
  const row = object(value);
  return row.passed === true ? { passed: true, observations: { valid: row.valid, total: row.total } } : { passed: false, code: "DEPENDENCY_FAILURE", message: `Only ${String(row.valid || 0)}/${String(row.total || 0)} campaign links validated.`, observations: { results: row.results } };
};
