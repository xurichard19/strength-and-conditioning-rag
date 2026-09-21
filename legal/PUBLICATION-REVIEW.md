# Arcel policy drafts — publication review

Research and repository review: September 19, 2026. These are substantial drafting materials, not a certification of legal compliance or authorization to launch. No deployment was performed. The website intentionally shows **Draft for review** and unresolved facts; this is a visible status, not a technical deployment lock.

## Drafts

- [Terms of Service](./terms.md)
- [Privacy Policy](./privacy.md), including a Nevada consumer-health supplement and conditional international sections
- [Consumer Health Privacy Policy](./health-privacy.md), kept separate for Washington
- [Fitness Disclaimer](./disclaimer.md)
- [Accessibility Statement](./accessibility.md)

The website reads `client/src/pages/legal-content.ts`. These Markdown copies are generated from that same source by `node legal/export-policies.mjs`; regenerate them after edits. The public routes are `/terms`, `/privacy`, `/health-privacy`, `/disclaimer`, and `/accessibility`.

## What needs an answer, and what does not

The collection fields, provider integrations, data flows, local session storage, conversation deletion, absence of a payment integration, and lack of account-deletion/consent controls were determined from the code. They do not need the owner to reconstruct or confirm how the code works. The policies use those findings.

Only business facts and practices outside the repository remain unknown: the legal operator and public contact, intended launch markets and age policy, future pricing, actual cloud/vendor settings and retention, provider contracts, and any manual disclosures or tools operated outside the app. Missing app functionality is an implementation task, not an unanswered business question. `IMPLEMENT BEFORE PUBLICATION` now distinguishes known code gaps from `CONFIRM` facts that require external evidence.

“Final public URLs” means the existing addresses, such as `https://arcelassist.vercel.app/terms` and `https://arcelassist.vercel.app/privacy`, must serve the adopted policies without requiring sign-in. A new domain or new URL scheme is not required. Local development URLs are for review and do not replace those public addresses.

## Owner decisions needed

| Decision | Current draft treatment |
| --- | --- |
| Legal operator, business address/country, functioning support/privacy contact | Explicit `CONFIRM` fields; a brand name or team biography does not establish the contracting party/controller. |
| Launch territories and actual establishment | US framework with conditional EEA/UK/Swiss/Canada material. Confirm countries and relevant states/provinces; additional local review may be needed. An App Store territory setting alone does not establish every territorial exclusion for an accessible website. |
| Minimum age | Proposed 18 **and** local age of majority, pending owner approval and implementation. This is not evidence that the app checks age. |
| Free or paid launch | Repository has no implemented purchase flow. Future Apple-subscription terms are expressly conditional; actual offers, renewal notices, cancellation and refunds must be reviewed before monetization. |
| No sale, advertising, affiliate disclosure, or general-purpose model training | Proposed operational commitments. Repository inspection supports the absence of corresponding integrations, but cannot establish company-wide practices or vendor account settings. |
| Retention and international transfers | Criteria are drafted; actual regions, provider periods, backup cycles, contracts and transfer safeguards remain unverified. |
| Liability and dispute terms | Consumer-protective wording; no invented corporate jurisdiction, mandatory arbitration, blanket injury release, or arbitrary damages cap. Obtain qualified local review before adoption. |
| Effective date and final wording | Set only after factual verification and required controls are operating. Remove draft and confirmation markers only then. |

## What the code actually supports

| Area | Evidence and implication |
| --- | --- |
| Public site | `client/src/main.tsx` mounts `PublicApp`; the latest main removes the legacy authenticated web pages entirely. The site serves the landing page, separate About page and public policies. No active waitlist, advertising or optional analytics integration was found. Hosting-dashboard settings are unverified. |
| Accounts | `mobile/src/services/api.ts` supports email/password and Google OAuth via Supabase, stores native auth sessions in AsyncStorage, and supplies device timezone. No encrypted-local-storage claim is made. |
| Health inputs | `mobile/src/screens/onboarding-screen.tsx` asks for capacity, pain/limitations, and optional injury notes. Setup can be completed without changing preselected answers, so saved capacity/pain values can be defaults rather than affirmative user reports. The note and display name are optional. Fixed-choice health fields have no decline option. Backend onboarding accepts an empty answers object; required completion is a mobile-navigation behavior, not backend validation of required health fields. |
| Conversations | Saved in Supabase; deletion removes a conversation and its associated messages from the active application database. This does not prove deletion of AI logs, traces or backups. |
| Training features | Backend supports detailed training records; mobile generated-workout/set editing still includes local previews. Calendar reads and sports-session integration are live. Copy is conditional on the feature actually used. |
| AI and retrieval | OpenAI receives prompts, selected context and recent history. Research embeddings are computed in the backend and sent to Chroma Cloud. Tavily receives generated search queries. Cohere reranking exists but is not the active chat path. |
| Monitoring | Optional Sentry limits body/default-PII/local-variable collection, but errors may still contain data. Optional LangSmith can capture workflow inputs and outputs; hiding metadata is not content redaction. |
| Infrastructure | Google Cloud backend, Supabase data/authentication, Vercel public site. Production deployment regions and contractual configurations were not verified. |

## Product and operational gaps before publication/submission

1. **Meaningful permissions.** Current signup copy is not a separate AI-sharing or health-data consent. Explain recipients, data, purposes and withdrawal before the first transmission. Record the approved notice/consent version and action. Apple requires explicit permission for third-party AI sharing; sensitive-data laws can impose additional requirements. Reject/withdraw must actually stop dependent processing. Do not use a blanket Terms agreement as consent.
2. **Account deletion.** No account-deletion UI or endpoint was found. Add an easily found in-app initiation path and delete associated records, with verification, status and lawful retention exceptions. A generic email-only support process is normally insufficient for this app. Test downstream provider deletion and backups. A database cascade is not a user-facing process.
3. **Privacy request operations.** Set up the monitored contact, identity/agent verification, access/correction/copy/deletion procedures, response tracking and appeals. The policy cannot create a working mailbox or export process. Washington response timing starts on receipt; Nevada deletion is 30 days after authentication. Map each jurisdiction’s rules rather than assuming a universal deadline.
4. **Minimization and tracing.** The present onboarding behavior is known: mobile setup completion is required, but all fixed choices are prefilled and can be saved untouched; there is no explicit decline option. Replace assumed health answers with meaningful choices and make nonessential health data optional. Do not enable raw health-bearing workflow traces without a documented purpose, legal basis, applicable consent, restricted access and retention. Search prompt instructions to omit identifiers are not a deterministic data-loss-prevention control.
5. **Providers, safeguards, and retention.** Verify all enabled vendors, DPAs, confidentiality, equal-protection commitments, permitted uses, model-training settings, subprocessor chains, deletion paths and regional transfers. Test backup expiry/restoration behavior. No claim of zero provider retention is justified by this review.
6. **Age and consent evidence.** Implement the chosen eligibility rule, avoid directing the service to children, and handle known underage records appropriately. Confirm whether any existing testers were minors.
7. **Apple disclosures.** Complete the privacy questionnaire for actual collection by Arcel and its partners, including health/fitness, identifiers, user content and diagnostics as applicable; distinguish collection, linkage and tracking using Apple’s definitions. Verify every policy link logged out and on device. Remove all draft fields before submission.
8. **Other Apple checks exposed by the audit.** Google login requires review against guideline 4.8’s equivalent-login requirements. Confirm whether sensitive-information processing requires legal-entity submission under 5.1.1(ix). A policy link does not resolve either issue. Paid launch requires an implemented purchase/restore/cancel flow and compliant offer disclosures.
9. **Health, AI, and accessibility operations.** Maintain a breach-response assessment, substantiate health/performance claims, and assess actual functionality rather than relying on a disclaimer to avoid medical-device obligations. If the EU is in scope, review AI Act Article 50 notices at first interaction and applicable provider/deployer obligations. Run an accessibility audit before making a conformance claim.

## App Store answer: external website hosting is acceptable

Apple requires an easily accessible in-app privacy-policy **link** and a privacy-policy URL in App Store Connect. This supports website-hosted policies; the text need not be hardcoded in a native screen. Arcel already opens `/privacy` and `/terms` in an Expo browser sheet from sign-in and the You screen. The new health-policy link uses the same component. Production URLs must be public, functional, readable without sign-in, and contain final policies. [App Review Guidelines §5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/#privacy), [App Store Connect privacy settings](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).

For auto-renewable subscriptions, both Terms of Use and Privacy links must be accessible inside the app. Show them at the purchase screen along with required offer details; keep them available in settings. The website footer alone is insufficient. [Paid Applications Agreement, Schedule 2 §3.8(b)](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/), [Apple subscription guidance](https://developer.apple.com/app-store/subscriptions/).

The draft uses Apple’s standard EULA for the iOS application license and separate Arcel service terms. If no custom EULA is submitted, Apple applies its standard license. For a custom EULA, enter the actual license text and select territories in App Store Connect; a website link alone does not configure it. Include the applicable EULA link in the subscription listing/description and review the final metadata against Apple’s requirements. [EULA configuration](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/), [standard license](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/).

Two independent requirements remain: explicit permission before third-party AI sharing under §5.1.2(i), and in-app initiation of account deletion. Email support alone is generally insufficient for deletion in an ordinary fitness app. [Data-use rules](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing), [account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

## Research basis and applicability

These sources were reviewed as primary law, regulator guidance or platform requirements. This is not an exhaustive worldwide legal assessment.

| Topic | Requirement relevant to Arcel | Primary source |
| --- | --- | --- |
| General privacy truthfulness | Notices must accurately reflect collection, use and disclosures; unsupported privacy/security claims create risk. | [FTC consumer health information guidance](https://www.ftc.gov/business-guidance/resources/collecting-using-or-sharing-consumer-health-information-look-hipaa-ftc-act-health-breach) |
| California website notice | CalOPPA notice duties can apply without CCPA business-size thresholds; categories, recipients, correction process, changes, effective date and tracking disclosures matter. | [CalOPPA §22575](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575.) |
| California comprehensive privacy | CCPA coverage is conditional. The adjusted revenue threshold is $26,625,000 from 2025, with alternative volume/revenue tests; verify actual applicability and 12-month disclosures. | [CPPA adjustment](https://cppa.ca.gov/regulations/cpi_adjustment.html), [California AG overview](https://www.oag.ca.gov/privacy/ccpa) |
| Washington consumer health | Small businesses can be covered. Separate health-only notice, specific disclosures, affirmative permissions and practical rights are required where applicable. | [Definitions](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010), [notice](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.020), [consent](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.030), [AG FAQ](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy) |
| Washington health rights | 45 days from receipt, one permitted extension, appeal procedure and downstream deletion; permitted backup delay at most six months after authentication. | [RCW 19.373.040](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.040&pdf=true) |
| Nevada consumer health | Distinct rights and deadlines; ordinarily 45 days after authentication, but deletion is 30 days. Notice includes processing, correction and cross-service collection disclosures. Nevada material is in the main Privacy Policy to keep Washington’s notice separate. | [NRS 603A.495–.520](https://www.leg.state.nv.us/NRS/NRS-603A.html) |
| Health breaches / HIPAA | Consumer fitness apps are not automatically HIPAA-covered. FTC health breach rules can cover qualifying non-HIPAA personal health records, including unauthorized disclosures; assess the multiple-source requirement and exceptions. | [FTC health-app tool](https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool), [HBNR compliance](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0) |
| EEA/UK privacy | Territorial coverage needs analysis. Transparent notices, lawful bases, special-category conditions, rights and transfers need operational support. Contract necessity alone is not a health-data condition. | [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), [ICO notice guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/), [ICO special-category conditions](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/) |
| EU AI transparency | Article 50 applies from August 2, 2026; where applicable, make direct AI interaction clear at first interaction. Terms alone are not the interface notice. | [European Commission FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act) |
| Canada | Meaningful consent, accountability and access obligations under PIPEDA and applicable provincial laws; sensitive information generally warrants express consent. Assess Québec separately. | [OPC applicability](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/r_o_p/02_05_d_26/), [OPC consent](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/), [PIPEDA access timing](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/section-8.html) |
| Children | An 18+ statement alone does not remove COPPA duties for child-directed services or known under-13 collection. | [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) |
| Health claims / medical functionality | Substantiate claims; disclaimers cannot cure contradictory claims. Assess intended use against the actual product. | [FTC health claims](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance), [FDA general wellness guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices) |
| Renewals and refunds | Clear terms, informed authorization, cancellation and local renewal protections; no invented paid offer. | [Apple subscription guidance](https://developer.apple.com/app-store/subscriptions/), [Apple cancellation](https://support.apple.com/en-us/118428), [California AG renewal guidance](https://www.oag.ca.gov/news/press-releases/attorney-general-bonta-issues-consumer-alert-california%E2%80%99s-automatic-renewal-law) |
| Accessibility claims | WCAG 2.2 AA is an evaluation target, not verified conformance. | [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), [W3C conformance guidance](https://www.w3.org/WAI/WCAG22/Understanding/conformance) |

## Final publication sequence

Confirm the business facts; have qualified counsel in the launch jurisdictions review the drafts; implement and verify the identified privacy controls; approve the vendor and retention register; fill every confirmation field and set the effective date; remove draft status; regenerate the review copies; deploy; test each public URL and in-app link; then complete App Store metadata and submission. Website policy publication does not establish that these operational steps have occurred.

## Validation of this change

The website production build and full lint passed. Mobile app/test type checks, the existing public-policy-link test, and focused lint passed; the mobile lint command used the client’s installed ESLint runtime because the mobile install lacks its configured `jiti` loader. All five public policy routes rendered successfully at widths of 1440, 390 and 320 pixels without horizontal overflow or browser errors. Contents anchors and the homepage health-policy link worked. Desktop and phone screenshots were visually inspected. These are implementation checks, not a comprehensive accessibility audit or legal-compliance certification. Live deployment and App Store Connect settings were not verified.

After pulling main through `6854db5`, the policy rendering was integrated into the new website design, preserving the separate About page and the deletion of the obsolete web app components. The policy source and generated copies matched the saved work. The updated website build and full lint, mobile type checks, all 136 mobile tests, and repeat policy route/layout/anchor checks passed. The development server was restarted on port 5173.
