// Legal identity used in the privacy policy. Set these in the environment (see .env.example).
// Defaults are deliberately obvious placeholders so they cannot be mistaken for real details.
// `pnpm build` prints a warning while any placeholder remains.
const env = import.meta.env;

export const legal = {
  entity: env.PUBLIC_LEGAL_ENTITY ?? "[LEGAL ENTITY NAME]",
  address: env.PUBLIC_LEGAL_ADDRESS ?? "[REGISTERED ADDRESS]",
  privacyEmail: env.PUBLIC_PRIVACY_EMAIL ?? "privacy@ownlevel.app",
  /** Person in charge of personal information (Quebec Law 25 requires a named person; the title is public). */
  privacyOfficer: env.PUBLIC_PRIVACY_OFFICER ?? "Privacy Officer",
  /** ISO date. Bump it, and the version history, whenever the policy changes materially. */
  effectiveDate: env.PUBLIC_PRIVACY_EFFECTIVE_DATE ?? "2026-11-02",
};

if (/\[[A-Z ]+\]/.test(legal.entity + legal.address)) {
  console.warn("[privacy] PUBLIC_LEGAL_ENTITY / PUBLIC_LEGAL_ADDRESS are not set: the privacy policy shows placeholders.");
}
