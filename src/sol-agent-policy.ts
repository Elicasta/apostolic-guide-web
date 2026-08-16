export type SolExplicitIntent = "mode" | "dismiss" | "cancel" | "retry";

function isCommand(text: string, verbs: string) {
  const direct = new RegExp(`^(?:please\\s+)?(?:sol[:,]?\\s+)?(?:${verbs})\\b`, "i");
  const polite = new RegExp(`\\b(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:${verbs})\\b`, "i");
  return direct.test(text) || polite.test(text);
}

export function hasExplicitSolIntent(message: string, action: SolExplicitIntent) {
  const text = message.trim().toLowerCase();
  if (action === "mode") {
    if (/^(watch|assist|trusted|off|watch mode|assist mode|trusted mode|autopilot)$/.test(text)) return true;
    return isCommand(text, "turn|switch|set|enable|disable|put|go") && /\b(watch|assist|trusted|autopilot|off)\b/.test(text);
  }
  if (action === "dismiss") return isCommand(text, "dismiss|remove|skip|ignore");
  if (action === "cancel") return isCommand(text, "cancel|stop|kill|abort");
  return isCommand(text, "retry|recover|resume|try\\s+again");
}
