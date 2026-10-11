import type { OperatorActionDefinition } from "./types";
import { privateActions } from "./actions/private";
import { publicEffectActions } from "./actions/public-effects";
import { readActions } from "./actions/reads";

const actions = new Map<string, OperatorActionDefinition>();

for (const action of [...readActions, ...privateActions, ...publicEffectActions]) {
  if (actions.has(action.name)) throw new Error(`Duplicate operator action: ${action.name}`);
  actions.set(action.name, action);
}

export function getOperatorAction(name: string) {
  return actions.get(name) ?? null;
}

export function listOperatorActions() {
  return [...actions.values()].map((action) => ({
    name: action.name,
    description: action.description,
    permission: action.permission,
    classification: action.classification
  }));
}
