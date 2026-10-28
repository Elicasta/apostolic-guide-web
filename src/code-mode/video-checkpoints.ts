/** A deployment may precede the optional Code Mode history table migration.
 * Only the exact missing-relation conditions may degrade to no history.
 * Authorization and all other DB errors must continue to fail closed.
 */
export function videoCheckpointTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const detail = error.message ?? "";
  return /(?:Could not find the table|relation .* does not exist)/i.test(detail)
    && /studio_code_mode_checkpoints/i.test(detail);
}
