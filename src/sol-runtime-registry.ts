import "server-only";
import { SolToolRegistry } from "./sol-core/tools/registry";
import { solHttpRequestTool } from "./sol-core/tools/http/request";
import { SolVerifierRegistry } from "./sol-core/verification/registry";

let tools: SolToolRegistry | null = null;
let verifiers: SolVerifierRegistry | null = null;

export function getSolRuntimeToolRegistry() {
  if (!tools) tools = new SolToolRegistry().register(solHttpRequestTool);
  return tools;
}

export function getSolRuntimeVerifierRegistry() {
  if (!verifiers) verifiers = new SolVerifierRegistry();
  return verifiers;
}
