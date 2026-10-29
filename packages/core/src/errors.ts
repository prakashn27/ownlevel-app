export class DomainError extends Error {
  constructor(
    public readonly code: "invalid_slug" | "slug_taken" | "invalid_input" | "not_found" | "forbidden" | "unauthorized",
    message: string,
  ) {
    super(message);
  }
}
