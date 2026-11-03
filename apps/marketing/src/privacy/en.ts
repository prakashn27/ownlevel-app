import { legal } from "../legal";
import type { PrivacyDoc } from "./types";

const mail = `<a href="mailto:${legal.privacyEmail}">${legal.privacyEmail}</a>`;

export const en: PrivacyDoc = {
  title: "Privacy Policy",
  description: "How Ownlevel collects, uses, shares and protects personal information, and the rights you have over it.",
  updated: "Effective date",
  toc: "Contents",
  summaryTitle: "Summary",
  summary: [
    "We act as a <strong>processor / service provider</strong> for the agencies that use Ownlevel: they decide what is done with their clients' and contacts' data, and we process it on their instructions.",
    "We act as a <strong>controller</strong> only for our own website, our customers' account holders, billing, security and product operations.",
    "We <strong>do not sell</strong> personal information and do not share it for cross-context behavioral advertising.",
    "This website does <strong>not</strong> use advertising or analytics cookies.",
    "You can contact us at " + mail + " to exercise your rights.",
  ],
  sections: [
    {
      id: "who-we-are",
      title: "1. Who we are and what this policy covers",
      html: `
<p>This Privacy Policy explains how <strong>${legal.entity}</strong> ("<strong>Ownlevel</strong>", "<strong>we</strong>", "<strong>us</strong>"), located at ${legal.address}, handles personal information when you:</p>
<ul>
  <li>visit our marketing website (the "<strong>Site</strong>");</li>
  <li>create an account or use the Ownlevel platform, apps, APIs and AI/MCP integrations (the "<strong>Service</strong>");</li>
  <li>communicate with us (support, sales, email, events).</li>
</ul>
<p>Ownlevel is a white-label platform. Our customers are agencies ("<strong>Agencies</strong>") who use the Service to serve their own clients ("<strong>Clients</strong>"), and the people who deal with those Clients ("<strong>Contacts</strong>": leads, customers, patients, visitors, and so on). Section 2 explains who is responsible for which data.</p>
<p>This policy does not apply to (a) Agencies' own websites, portals, emails or messages, which are governed by the Agency's privacy policy, or (b) instances of Ownlevel that someone else runs on their own infrastructure (see section 15).</p>
<p>If you do not agree with this policy, please do not use the Site or the Service.</p>`,
    },
    {
      id: "roles",
      title: "2. Our role: controller or processor",
      html: `
<p><strong>When we are the controller (or "business" / organization responsible for personal information).</strong> We decide why and how we use the data for: the Site; Agency users' accounts, authentication and billing; our own marketing and sales; security, fraud prevention and abuse detection; service analytics; legal compliance; and support requests sent to us.</p>
<p><strong>When we are the processor (or "service provider" / "mandatary").</strong> When an Agency or Client puts Contact data into the Service (contact records, conversations, appointments, form submissions, call or message content, files, and similar), the Agency is the controller and we process that data only to provide the Service on the Agency's documented instructions, under our customer agreement and data processing terms. We do not use Contact data for our own purposes, other than to operate, secure and support the Service and as required by law.</p>
<p><strong>If you are a Contact</strong> of an Agency or Client (for example you booked an appointment or sent a message) and want to access, correct or delete your data, please contact that business first. It controls your data and decides how to respond. If you contact us, we will forward your request to the right Agency where we can identify it, and we will not respond to the substance of the request ourselves unless the Agency instructs us or the law requires it.</p>
<p>Agencies are responsible for having a lawful basis, giving notices and obtaining any consent required (including for calls, SMS and email marketing, recording, and AI processing) before they load Contact data into the Service or send messages through it.</p>`,
    },
    {
      id: "information-we-collect",
      title: "3. Information we collect",
      html: `
<h3>3.1 Information you give us</h3>
<ul>
  <li><strong>Account data:</strong> name, work email, password (stored only as a salted hash), role, agency name, hostnames or custom domains, branding assets.</li>
  <li><strong>Billing data:</strong> billing name and address, plan, invoices and payment status. Card details are handled by our payment processor and are not stored by us.</li>
  <li><strong>Communications:</strong> messages you send to support or sales and their content.</li>
  <li><strong>Content you place in the Service</strong> (Customer Data): this may include Contact data described in section 2. We do not decide what you put in it; please do not submit data you are not allowed to submit.</li>
</ul>
<h3>3.2 Information collected automatically</h3>
<ul>
  <li><strong>Technical and security data:</strong> IP address, device and browser type, operating system, request logs (URL, timestamp, status), authentication events, session identifiers, rate-limit and abuse signals.</li>
  <li><strong>Service usage data:</strong> features used, API/MCP calls, error and performance diagnostics. We use this to run, secure and improve the Service.</li>
</ul>
<h3>3.3 Information from connected services</h3>
<p>If you or your Agency connect third-party services (for example a calendar, an email or messaging provider, or an AI assistant through OAuth/MCP), we receive the data those services share under the permissions (scopes) you approve, and we store the tokens needed to keep the connection working. You can revoke a connection at any time in the Service or with the third party.</p>
<h3>3.4 Sensitive information</h3>
<p>We do not ask for sensitive personal information for our own purposes. Agencies in sectors such as health, legal, insurance or finance may store sensitive information about their Contacts in the Service. If you are subject to special rules (for example HIPAA or similar health-privacy laws), you must have the appropriate agreements with us in place <em>before</em> you put that data in the Service. Without them, do not use the Service for protected health information.</p>`,
    },
    {
      id: "cookies",
      title: "4. Cookies and similar technologies",
      html: `
<p><strong>The Site</strong> does not set advertising, analytics or tracking cookies, and does not use third-party advertising pixels. Our hosting provider may process technical request data (such as IP address) to deliver and protect the Site.</p>
<p><strong>The Service</strong> (the web app) uses only strictly necessary cookies and local storage to keep you signed in, protect against cross-site request forgery, and remember essential preferences (such as language). These do not require consent and cannot be switched off without breaking the Service.</p>
<p>If we introduce non-essential cookies or analytics in the future, we will update this policy and, where the law requires, ask for your consent first. We honor the Global Privacy Control (GPC) signal and similar opt-out signals where required by law.</p>`,
    },
    {
      id: "how-we-use",
      title: "5. How we use personal information and our legal bases",
      html: `
<p>Where the GDPR or UK GDPR applies, we rely on these legal bases (in Canada, we rely on your consent, express or implied, or on another basis permitted by law):</p>
<table>
  <thead><tr><th>Purpose</th><th>Legal basis</th></tr></thead>
  <tbody>
    <tr><td>Provide, maintain and support the Service; create and manage accounts; process payments</td><td>Performance of a contract; legitimate interests</td></tr>
    <tr><td>Authenticate users, secure the Service, prevent fraud, abuse and spam, enforce our terms</td><td>Legitimate interests (keeping the Service safe); legal obligation</td></tr>
    <tr><td>Product analytics, debugging, capacity planning and improving the Service (using de-identified or aggregated data where practical)</td><td>Legitimate interests</td></tr>
    <tr><td>Send service notices (security, billing, changes to terms)</td><td>Performance of a contract; legal obligation</td></tr>
    <tr><td>Send marketing emails about Ownlevel to business contacts</td><td>Consent, or legitimate interests where the law permits; you can opt out at any time</td></tr>
    <tr><td>Comply with law, respond to lawful requests, establish or defend legal claims</td><td>Legal obligation; legitimate interests</td></tr>
  </tbody>
</table>
<p>We do not make decisions about individuals based solely on automated processing that produce legal or similarly significant effects. We do not sell personal information and do not use Customer Data to build advertising profiles.</p>`,
    },
    {
      id: "ai",
      title: "6. AI features",
      html: `
<p>The Service includes AI features (such as AI agents, drafting and summarization, and the ability to connect AI assistants through MCP). When you use them, relevant content (for example a message thread or contact record) is sent to an AI model provider to generate a result for you.</p>
<ul>
  <li>We send only the data needed to perform the requested function.</li>
  <li>We do not use Customer Data to train our own or third-party general-purpose AI models, and we do not permit our AI providers to do so with it.</li>
  <li>AI-generated output can be inaccurate. Outbound actions by AI agents are designed to require human approval, and Agencies remain responsible for reviewing output before relying on it or sending it.</li>
  <li>When Agencies connect an external AI assistant (for example Claude or ChatGPT) through OAuth/MCP, data shared with that assistant is governed by the assistant provider's terms and privacy policy, not ours.</li>
  <li>Agencies are responsible for informing their Contacts that AI is used and for any required consent or disclosure.</li>
</ul>`,
    },
    {
      id: "sharing",
      title: "7. How we share personal information",
      html: `
<p>We do not sell personal information. We do not "share" it for cross-context behavioral advertising. We disclose it only as follows:</p>
<ul>
  <li><strong>Agencies and Clients.</strong> Contact data belongs to the relevant Agency and is visible to its authorized users according to the roles and permissions that Agency configures.</li>
  <li><strong>Service providers (subprocessors).</strong> Vendors that help us run the Service, under written contracts that restrict their use of the data to what we instruct and require appropriate security. They fall in these categories:
    <ul>
      <li>cloud hosting, networking, CDN, security and edge compute (<strong>Cloudflare</strong>);</li>
      <li>managed database hosting and storage;</li>
      <li>transactional email delivery (<strong>Resend</strong>);</li>
      <li>SMS, voice and messaging carriers and APIs, when an Agency enables messaging;</li>
      <li>AI model providers (section 6);</li>
      <li>payment processing and invoicing;</li>
      <li>calendar and email integrations that you connect;</li>
      <li>error monitoring, support and communications tools.</li>
    </ul>
    A current list with the processing location of each subprocessor is available on request at ${mail}. We give customers advance notice of new subprocessors that process Customer Data, and a chance to object, as set out in our customer agreement.</li>
  <li><strong>Legal and safety.</strong> When we believe in good faith that disclosure is required by law, subpoena, court order or valid government request, or is necessary to protect rights, safety, security or property, or to detect and prevent fraud or abuse. Where permitted, we will notify the affected customer first and challenge requests that appear overbroad.</li>
  <li><strong>Business transfers.</strong> In a merger, acquisition, financing, reorganization or sale of assets, personal information may be transferred to the successor, which must continue to honor this policy or give you notice of changes and choices.</li>
  <li><strong>With your direction or consent.</strong> For example when you enable an integration.</li>
  <li><strong>De-identified or aggregated data</strong> that cannot reasonably be used to identify you, which we will not attempt to re-identify.</li>
</ul>`,
    },
    {
      id: "transfers",
      title: "8. International transfers",
      html: `
<p>We and our subprocessors may process and store personal information in countries other than where you live, including Canada, the United States and the European Union. These countries may have data protection laws different from yours, and your information may be accessible to courts and authorities there.</p>
<p>Where required, we use appropriate safeguards for transfers: the European Commission's Standard Contractual Clauses (and the UK International Data Transfer Addendum), adequacy decisions, and for Quebec, an assessment of privacy-related factors and written agreements before communicating personal information outside Quebec. You can request a copy of the relevant safeguards at ${mail}.</p>`,
    },
    {
      id: "retention",
      title: "9. Retention",
      html: `
<p>We keep personal information only as long as necessary for the purposes described in this policy, then delete or de-identify it.</p>
<ul>
  <li><strong>Account and billing data:</strong> while the account is active and afterward as needed for accounting, tax and legal obligations (generally up to seven years for financial records).</li>
  <li><strong>Customer Data (including Contact data):</strong> until the Agency deletes it or the agreement ends. After termination, we delete or return it within a reasonable period (generally within 30 days), subject to legal retention duties. Deleted data may persist in encrypted backups for a limited period (generally up to 35 days) until they are overwritten.</li>
  <li><strong>Security and request logs:</strong> typically up to 12 months, longer if needed to investigate an incident or as required by law.</li>
  <li><strong>Marketing and support communications:</strong> until you opt out or ask us to delete them, or for a reasonable period after our last interaction.</li>
</ul>
<p>Agencies set their own retention practices for Contact data and are responsible for them.</p>`,
    },
    {
      id: "security",
      title: "10. Security and incidents",
      html: `
<p>We use technical and organizational measures that are appropriate to the sensitivity of the data, including:</p>
<ul>
  <li>encryption of data in transit (TLS);</li>
  <li>strict tenant isolation: database row-level security so that each Agency and Client can only reach its own data;</li>
  <li>role-based access control, least-privilege access for staff and short-lived, scoped OAuth tokens for apps and AI assistants;</li>
  <li>hashed passwords, session controls and rate limiting;</li>
  <li>backups and recovery procedures, and access logging.</li>
</ul>
<p>No system is perfectly secure, and we cannot guarantee absolute security. You are responsible for keeping your credentials confidential and for configuring your users' permissions.</p>
<p>If we become aware of a breach of security safeguards affecting personal information, we will assess it and notify affected customers and, where the law requires, regulators and individuals, without undue delay. For personal information we process on behalf of an Agency, we will notify the Agency so it can meet its own obligations. We keep a register of confidentiality incidents as required by Quebec law.</p>`,
    },
    {
      id: "rights",
      title: "11. Your privacy rights",
      html: `
<p>Depending on where you live, you may have some or all of the rights below. We do not charge a fee or discriminate against you for exercising them, except where permitted by law for manifestly unfounded or excessive requests.</p>
<ul>
  <li><strong>Access</strong> to the personal information we hold about you and information about how it is used and shared;</li>
  <li><strong>Correction</strong> of inaccurate or incomplete information;</li>
  <li><strong>Deletion</strong> of your information (subject to legal exceptions);</li>
  <li><strong>Portability</strong> in a structured, commonly used technological format;</li>
  <li><strong>Restriction or objection</strong> to certain processing, including direct marketing;</li>
  <li><strong>Withdrawal of consent</strong> at any time, without affecting earlier processing;</li>
  <li><strong>Opt-out of sale, sharing and targeted advertising</strong> (we do none of these);</li>
  <li><strong>Not to be subject to solely automated decisions</strong> with significant effects, and to ask for human review;</li>
  <li><strong>To lodge a complaint</strong> with a supervisory authority (section 14).</li>
</ul>
<h3>How to exercise your rights</h3>
<p>Email ${mail} from the address associated with your account or include enough information for us to verify your identity (we may ask for additional information, and will not disclose data until we have verified the request). Authorized agents must provide proof of authorization. We respond within the period required by law: generally within 30 days (Canada, EU/UK; extendable where permitted) and 45 days (US states; extendable once). If we refuse, we will explain why and describe how to appeal or complain. For US residents, you may appeal a refusal by replying to our decision email.</p>
<p>If your request concerns data we hold as a processor, we will direct you to the Agency responsible for it (section 2).</p>`,
    },
    {
      id: "quebec",
      title: "12. Additional information for Quebec residents",
      html: `
<ul>
  <li>Our person in charge of the protection of personal information is the <strong>${legal.privacyOfficer}</strong>, reachable at ${mail}.</li>
  <li>We collect only the personal information necessary for the purposes in this policy, and we ask for consent in clear, simple terms, separately from other information, when the law requires it. Express consent is requested for sensitive information.</li>
  <li>We do not use technology that identifies, locates or profiles you without informing you beforehand and giving you the means to activate such functions.</li>
  <li>Where a decision about you is made exclusively through automated processing, we will inform you, and you may ask what information was used, the principal factors, and request a review by a person.</li>
  <li>You may ask us to stop disseminating your personal information or to de-index any hyperlink attached to your name that gives access to it, where the law's conditions are met.</li>
  <li>We conduct privacy impact assessments before communicating personal information outside Quebec.</li>
  <li>This policy is available in French and English. In case of inconsistency, the version most favorable to the protection of personal information prevails to the extent permitted by law.</li>
</ul>`,
    },
    {
      id: "us-states",
      title: "13. Additional information for US residents (CCPA/CPRA and other state laws)",
      html: `
<p>In the last 12 months, we have collected the following categories of personal information (as defined by California law): identifiers (name, email, IP address); customer records (billing details); commercial information (plan, usage); internet or network activity (logs, usage data); professional information (role, agency); and inferences from usage solely to operate the Service. We collect these from you, from your use of the Service, and from connected services. We disclose them for business purposes to the categories of service providers in section 7.</p>
<ul>
  <li>We <strong>do not sell</strong> or <strong>share</strong> (for cross-context behavioral advertising) personal information, including of anyone under 16, and we do not use or disclose sensitive personal information for purposes that would require a right to limit.</li>
  <li>We act as a "service provider" or "processor" for Customer Data, and process it only for the business purposes in our agreement with the Agency.</li>
  <li>California residents may also ask which personal information categories we disclosed for direct marketing by third parties (we disclose none).</li>
</ul>
<p>The Service is business-to-business; California's rules for employee and business-contact data apply to the extent of the relevant information we hold.</p>`,
    },
    {
      id: "complaints",
      title: "14. Contact, complaints and regulators",
      html: `
<p>Questions, requests or concerns: ${mail}, or by mail to ${legal.entity}, Attn: ${legal.privacyOfficer}, ${legal.address}.</p>
<p>We would like the chance to resolve your concern first, but you may also contact your regulator at any time:</p>
<ul>
  <li>Quebec: <a href="https://www.cai.gouv.qc.ca" rel="noopener">Commission d'accès à l'information du Québec</a></li>
  <li>Canada: <a href="https://www.priv.gc.ca" rel="noopener">Office of the Privacy Commissioner of Canada</a> (and provincial commissioners in Alberta and British Columbia)</li>
  <li>EU/EEA: your local data protection authority</li>
  <li>UK: <a href="https://ico.org.uk" rel="noopener">Information Commissioner's Office</a></li>
  <li>US: your state Attorney General</li>
</ul>`,
    },
    {
      id: "self-hosted",
      title: "15. Self-hosted instances",
      html: `
<p>Ownlevel's software can be self-hosted by anyone under its open-source license. If you use an instance run by someone else, that operator, not us, controls your data and is responsible for its privacy practices. We do not receive data from self-hosted instances unless the operator chooses to send it to us.</p>`,
    },
    {
      id: "messaging",
      title: "16. Customers' messaging and compliance duties",
      html: `
<p>Agencies and Clients using the Service to send SMS, email, calls or other messages, or to record or transcribe communications, must comply with all applicable laws, including CASL, the TCPA, CAN-SPAM, the GDPR/ePrivacy rules and local recording-consent laws. That includes obtaining and documenting consent, honoring opt-outs and identifying themselves. We provide tools but do not provide legal advice, and Agencies are solely responsible for their use of the Service and the content of their communications.</p>`,
    },
    {
      id: "children",
      title: "17. Children",
      html: `
<p>The Site and Service are for businesses and are not directed to children. We do not knowingly collect personal information from anyone under 16 for our own purposes. If you believe a child has given us personal information, contact ${mail} and we will delete it. Agencies are responsible for the lawfulness of any children's data they process through the Service.</p>`,
    },
    {
      id: "third-party",
      title: "18. Third-party links and services",
      html: `
<p>The Site and Service may link to third-party websites and services that we do not control. Their privacy practices are their own; review them before you provide information.</p>`,
    },
    {
      id: "changes",
      title: "19. Changes to this policy",
      html: `
<p>We may update this policy as our Service, the law or our practices change. We will post the new version here with a new effective date and, for material changes, notify account holders by email or in the Service before the change takes effect, and obtain consent where the law requires it. Continued use after the effective date means you accept the update, to the extent permitted by law. Nothing in this policy limits any right you have under applicable law, and in a conflict, the law and our signed agreement with the Agency prevail over this policy.</p>`,
    },
  ],
};
