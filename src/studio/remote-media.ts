export type RemoteMediaRole="producer"|"host"|"guest"|"output";
export type RemoteMediaIdentity={participantId:string;displayName:string;role:RemoteMediaRole;episodeId:string;guestId?:string};
export type RemoteMediaConfig={provider:"livekit";serverUrl:string};
export function getRemoteMediaConfig():RemoteMediaConfig|null{const serverUrl=process.env.LIVEKIT_URL?.trim();const apiKey=process.env.LIVEKIT_API_KEY?.trim();const apiSecret=process.env.LIVEKIT_API_SECRET?.trim();if(!serverUrl||!apiKey||!apiSecret)return null;return{provider:"livekit",serverUrl};}
export function remoteMediaRoomName(episodeId:string){return`ag-studio-${episodeId}`;}
export function remoteParticipantIdentity(input:RemoteMediaIdentity){return `${input.role}:${input.guestId??input.participantId}`;}
export function remoteMediaConfigured(){return Boolean(getRemoteMediaConfig());}
