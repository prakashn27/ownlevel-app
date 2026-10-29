import type en from "./messages/en.json";

// Makes t("...") keys type-checked against the English catalog.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
  }
}
