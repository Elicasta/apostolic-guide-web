import { z } from "zod";

export const welcomeCopySchema = z.object({
  subject: z.string().trim().min(5).max(140),
  previewText: z.string().trim().min(5).max(230),
  headline: z.string().trim().min(3).max(120),
  greeting: z.string().trim().min(3).max(140),
  body: z.string().trim().min(20).max(1500),
  buttonLabel: z.string().trim().min(3).max(65),
  buttonUrl: z.string().url().max(500).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && ["apostolicguide.com","www.apostolicguide.com","app.apostolicguide.com"].includes(url.hostname)
      && !url.username && !url.password;
  }, "Choose an HTTPS Apostolic Guide destination.")
}).strict();

export type WelcomeCopy = z.infer<typeof welcomeCopySchema>;

export const DEFAULT_WELCOME_COPY: WelcomeCopy = {
  subject: "Welcome to Apostolic Guide — Scripture first.",
  previewText: "Thank you for subscribing. Start with a Scripture pathway and keep studying in the Apostolic Guide app.",
  headline: "Thank you for subscribing.",
  greeting: "We’re glad you’re here.",
  body: "Apostolic Guide exists to help people search the Scriptures, follow connected passages, ask honest questions, and understand not only what they believe, but why they believe it.",
  buttonLabel: "Explore Scripture Pathways",
  buttonUrl: "https://www.apostolicguide.com/pathways"
};

export type EmailAutomationStatus = "active" | "paused";
export function parseWelcomeCopy(value: unknown): WelcomeCopy {
  const parsed = welcomeCopySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_WELCOME_COPY;
}
