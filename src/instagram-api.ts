export function instagramGraphVersion(value?: string | null) {
  return typeof value === "string" && /^v\d+\.\d+$/.test(value.trim()) ? value.trim() : "v24.0";
}

/**
 * Apostolic Guide stores Instagram User access tokens obtained through Business
 * Login for Instagram. That API mode uses graph.instagram.com. Do not switch
 * individual publishing calls to graph.facebook.com unless the credential model
 * is deliberately migrated to Facebook Page access tokens as a separate change.
 */
export function instagramGraphBase(value?: string | null) {
  return `https://graph.instagram.com/${instagramGraphVersion(value)}`;
}
