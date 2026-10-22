/** Pure policy for read-only access through an explicit, revocable remote venue invite. */
export function isActiveVenueGrant(input: {
  inviteEpisodeId:string;
  guestEpisodeId:string;
  requestedEpisodeId:string;
  status:string;
  expiresAt:string|null;
  isRemoteVenue:boolean;
}, now=Date.now()) {
  if (!input.isRemoteVenue || input.status!=="active" ||
      input.inviteEpisodeId!==input.requestedEpisodeId ||
      input.guestEpisodeId!==input.requestedEpisodeId) return false;
  if (!input.expiresAt) return true;
  const expires=new Date(input.expiresAt).getTime();
  return Number.isFinite(expires) && expires>now;
}
