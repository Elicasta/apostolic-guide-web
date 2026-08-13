export type AutoDirectorMode="off"|"assist"|"auto";
export type AutoDirectorInput={mode:AutoDirectorMode;manualOverrideUntil?:string|null;liveGuestCount:number;activeQuestion:boolean;activeScripture:boolean;currentSceneId:string;lastSceneChangedAt?:string|null;minimumHoldSeconds:number};
export type AutoDirectorDecision={sceneId?:string;reason:string;shouldApply:boolean};
export function decideAutoScene(input:AutoDirectorInput,now=new Date()):AutoDirectorDecision{
 if(input.mode==="off")return{reason:"Auto director disabled",shouldApply:false};
 if(input.manualOverrideUntil&&new Date(input.manualOverrideUntil)>now)return{reason:"Manual override active",shouldApply:false};
 if(input.lastSceneChangedAt){const held=(now.getTime()-new Date(input.lastSceneChangedAt).getTime())/1000;if(held<input.minimumHoldSeconds)return{reason:"Minimum shot hold active",shouldApply:false};}
 let sceneId:string;
 if(input.activeQuestion)sceneId="panel-question";
 else if(input.activeScripture)sceneId=input.liveGuestCount>0?"panel-scripture":"host-scripture";
 else if(input.liveGuestCount>=2)sceneId="panel-grid";
 else if(input.liveGuestCount===1)sceneId="split";
 else sceneId="host-full";
 if(sceneId===input.currentSceneId)return{sceneId,reason:"Already on recommended scene",shouldApply:false};
 return{sceneId,reason:`Recommended ${sceneId} from current show state`,shouldApply:input.mode==="auto"};
}
