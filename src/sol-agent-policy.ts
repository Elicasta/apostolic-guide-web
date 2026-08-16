export type SolExplicitIntent = "mode" | "dismiss" | "cancel" | "retry";

export function hasExplicitSolIntent(message: string, action: SolExplicitIntent) {
  const text = message.toLowerCase();
  if (action === "mode") return /\b(turn|switch|set|enable|disable|off|watch|assist|trusted|autopilot)\b/.test(text);
  if (action === "dismiss") return /\b(dismiss|remove|skip|ignore)\b/.test(text);
  if (action === "cancel") return /\b(cancel|stop|kill|abort)\b/.test(text);
  return /\b(retry|recover|try again|resume)\b/.test(text);
}
