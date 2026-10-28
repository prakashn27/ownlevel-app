export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const hreflang: Record<Locale, string> = { en: "en", fr: "fr-CA" };

// Brand is config; messages use {brand}.
export const ui = {
  en: {
    "nav.industries": "Industries",
    "nav.blog": "Blog",
    "nav.signin": "Sign in",
    "nav.cta": "Get started",
    "hero.title": "The AI-first agency OS you can make your own",
    "hero.sub": "{brand} gives agencies a white-label platform with CRM, automations and AI agents for every client.",
    "hero.cta": "Start free",
    "industries.title": "Built for your industry",
    "industries.learn": "Learn more",
    "features.title": "Everything in one platform",
    "features.1.t": "White-label",
    "features.1.b": "Your brand, your domain, your pricing.",
    "features.2.t": "AI agents",
    "features.2.b": "Agents that work for each client, with human approval on outbound actions.",
    "features.3.t": "Automations",
    "features.3.b": "Event-driven workflows for SMS, email and follow-ups.",
    "footer.rights": "All rights reserved.",
    "lang.switch": "Français",
  },
  fr: {
    "nav.industries": "Secteurs",
    "nav.blog": "Blogue",
    "nav.signin": "Connexion",
    "nav.cta": "Commencer",
    "hero.title": "La plateforme d'agence propulsée par l'IA, à votre image",
    "hero.sub": "{brand} offre aux agences une plateforme en marque blanche avec CRM, automatisations et agents IA pour chaque client.",
    "hero.cta": "Essayer gratuitement",
    "industries.title": "Conçu pour votre secteur",
    "industries.learn": "En savoir plus",
    "features.title": "Tout dans une seule plateforme",
    "features.1.t": "Marque blanche",
    "features.1.b": "Votre marque, votre domaine, vos tarifs.",
    "features.2.t": "Agents IA",
    "features.2.b": "Des agents pour chaque client, avec approbation humaine des actions sortantes.",
    "features.3.t": "Automatisations",
    "features.3.b": "Des flux de travail déclenchés par événements : SMS, courriels et relances.",
    "footer.rights": "Tous droits réservés.",
    "lang.switch": "English",
  },
} as const;
