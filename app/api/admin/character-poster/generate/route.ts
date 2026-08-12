import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  character: z.enum(["Peter","Paul","John","Moses","David","Jesus"]),
  pose: z.enum(["standing","preaching","walking","profile","portrait"]),
  direction: z.enum(["left","center","right"]),
  treatment: z.enum(["cinematic","documentary","editorial"])
});

const CHARACTER_NOTES:Record<string,string>={
  Peter:"first-century Galilean Jewish man, weathered fisherman build, dark hair and beard, grounded and resolute",
  Paul:"first-century Jewish man from Tarsus, compact build, dark hair and beard, intense intelligent expression",
  John:"first-century Jewish man, younger adult, dark hair and beard, contemplative but strong",
  Moses:"ancient Near Eastern Hebrew man, older, weathered face, long dark-gray beard, commanding presence",
  David:"ancient Israelite man, athletic build, dark hair and beard, alert expression",
  Jesus:"first-century Jewish man from Galilee, Middle Eastern appearance, dark hair and beard, calm authoritative expression"
};

export async function POST(request:Request){
  const {access,allowed}=await getStudioPermission("manage_content");
  if(!allowed||access.state!=="allowed") return NextResponse.json({error:"Forbidden"},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid character request."},{status:400});
  const apiKey=process.env.OPENAI_API_KEY?.trim();
  if(!apiKey) return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:503});
  const model=process.env.OPENAI_CAROUSEL_IMAGE_MODEL?.trim()||"gpt-image-2";
  const {character,pose,direction,treatment}=parsed.data;
  const prompt=[
    `Create a full-body cutout of ${character} for a premium editorial Christian social poster.`,
    CHARACTER_NOTES[character],
    `Pose: ${pose}. Subject should visually face or move toward the ${direction}.`,
    treatment==="cinematic"?"Cinematic hard side lighting, deep contrast, photographic realism.":treatment==="documentary"?"Documentary black-and-white editorial photography, raw texture, strong natural contrast.":"High-fashion editorial portrait treatment, controlled studio light, graphic silhouette.",
    "Historically plausible clothing for the biblical era. No modern clothing, no halos, no text, no symbols, no frame, no scenery.",
    "Transparent background. Keep the entire figure cleanly separated with crisp edges so typography can pass behind and in front of the subject.",
    "Avoid glossy devotional-stock-art styling. Aim for a modern campaign/editorial image while retaining historical plausibility."
  ].join("\n");
  const response=await fetch("https://api.openai.com/v1/images/generations",{
    method:"POST",
    headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},
    body:JSON.stringify({model,prompt,size:"1024x1536",quality:"low",background:"transparent",output_format:"png",n:1})
  });
  if(!response.ok){
    const detail=(await response.text().catch(()=>"")).slice(0,1200);
    return NextResponse.json({error:`Character generation failed (${response.status}).`,detail},{status:502});
  }
  const result=await response.json();
  const b64=result?.data?.[0]?.b64_json;
  if(typeof b64!=="string"||!b64) return NextResponse.json({error:"Image model returned no image."},{status:502});
  return NextResponse.json({image:`data:image/png;base64,${b64}`,model,prompt});
}
