import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { CharacterPosterStudio } from "@/character-poster-studio";
import "./character-poster.css";

export default async function CharacterPosterPage(){
  const { access, allowed } = await getStudioPermission("manage_content");
  if(!allowed || access.state !== "allowed") redirect("/admin");
  return <CharacterPosterStudio aiReady={Boolean(process.env.OPENAI_API_KEY?.trim())}/>;
}
