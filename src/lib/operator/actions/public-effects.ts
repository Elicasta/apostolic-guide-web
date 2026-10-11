import { z } from "zod";
import type { OperatorActionDefinition } from "../types";
import { PUBLIC_EFFECT_BLOCK_MESSAGE } from "../types";

/** Incremented only if a public-effect handler is invoked. Execute must leave this at zero. */
export const publicEffectHandlerCalls = { count: 0 };

export function resetPublicEffectHandlerCalls() {
  publicEffectHandlerCalls.count = 0;
}

const emptyInput = z.object({}).strict();

function blockedHandler(): OperatorActionDefinition["handler"] {
  return async () => {
    publicEffectHandlerCalls.count += 1;
    throw new Error(PUBLIC_EFFECT_BLOCK_MESSAGE);
  };
}

export const publicEffectActions: OperatorActionDefinition[] = [
  {
    name: "distribution.publish",
    description: "Publish or schedule a public post. Blocked until Eli approves it from the Approval Inbox.",
    inputSchema: emptyInput,
    permission: "manage_distribution",
    classification: "public_effect",
    handler: blockedHandler()
  },
  {
    name: "message.send",
    description: "Send a DM, reply, email, or broadcast. Blocked until Eli approves it from the Approval Inbox.",
    inputSchema: emptyInput,
    permission: "manage_inbox",
    classification: "public_effect",
    handler: blockedHandler()
  },
  {
    name: "automation.activate",
    description: "Activate an Instagram automation. Blocked until Eli approves it from the Approval Inbox.",
    inputSchema: emptyInput,
    permission: "manage_distribution",
    classification: "public_effect",
    handler: blockedHandler()
  },
  {
    name: "journey.enroll",
    description: "Enroll a person or activate a journey. Blocked until Eli approves it from the Approval Inbox.",
    inputSchema: emptyInput,
    permission: "manage_journeys",
    classification: "public_effect",
    handler: blockedHandler()
  }
];
