import "server-only";
import { createServiceClient } from "./supabase";

/** Stop is one database transaction: pause, cancel jobs, revoke approvals and audit. */
export async function stopSolOperator(actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { data, error } = await service.rpc("stop_sol_operator", { p_actor_user_id: actorUserId });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Stop Sol did not return a confirmation.");
  return data as { cancelled_runs: number; cancelled_approvals: number; stopped_at: string };
}
