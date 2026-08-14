import { studyCardImage } from "@/study-card-image";

export const runtime = "edge";

export async function GET() {
  return studyCardImage("God Is One");
}
