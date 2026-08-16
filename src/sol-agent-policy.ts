export type SolExplicitIntent = "mode" | "dismiss" | "cancel" | "retry";

export function hasExplicitSolIntent(message: string, action: SolExplicitIntent) {
  const text = message.trim().toLowerCase();
  if (action === "mode") {
    if (/^(watch|assist|trusted|off|watch mode|assist mode|trusted mode|autopilot)$/.test(text)) return true;
    return /\b(turn|switch|set|enable|disable|put|go)\b[\s\S]{0,40}\b(watch|assist|trusted|autopilot|off)\b/.test(text)
      || /\b(watch|assist|trusted|autopilot)\b[\s\S]{0,24}\bmode\b[\s\S]{0,24}\b(on|now|please)\b/.test(text);
  }
  if (action === "dismiss") return /\b(dismiss|remove|skip|ignore)\b/.test(text);
  if (action === "cancel") return /\b(cancel|stop|kill|abort)\b/.test(text);
  return /\b(retry|recover|try again|resume)\b/.test(text);
}
