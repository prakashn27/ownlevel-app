export interface PrivacySection { id: string; title: string; html: string }
export interface PrivacyDoc {
  title: string;
  description: string;
  updated: string;
  toc: string;
  summaryTitle: string;
  summary: string[];
  sections: PrivacySection[];
}
