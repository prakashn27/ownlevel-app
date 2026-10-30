export class DomainError extends Error {
  constructor(
    public readonly code: "invalid_slug" | "slug_taken" | "invalid_input" | "not_found" | "forbidden" | "unauthorized" | "conflict" | "rate_limited",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
