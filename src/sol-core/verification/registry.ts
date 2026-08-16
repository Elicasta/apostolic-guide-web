export type SolVerificationResult =
  | { passed: true; code?: string; message?: string; observations?: Record<string, unknown> }
  | { passed: false; code: string; message: string; observations?: Record<string, unknown> };

export type SolVerifier<T = unknown> = (value: T, context: { runId: string; taskId: string }) => Promise<SolVerificationResult>;

export class SolVerifierRegistry {
  private readonly verifiers = new Map<string, SolVerifier>();

  register<T>(name: string, verifier: SolVerifier<T>) {
    if (this.verifiers.has(name)) throw new Error(`SOL verifier already registered: ${name}`);
    this.verifiers.set(name, verifier as SolVerifier);
    return this;
  }

  get(name: string) {
    const verifier = this.verifiers.get(name);
    if (!verifier) throw new Error(`SOL verifier is not registered: ${name}`);
    return verifier;
  }

  has(name: string) {
    return this.verifiers.has(name);
  }
}
