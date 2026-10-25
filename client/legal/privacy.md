# Privacy Policy

> Draft for review. These policies describe the current application, but are not yet effective. Business details and launch decisions remain open; production-only settings need verification, and missing consent and account-deletion controls need implementation.

Draft prepared September 19, 2026

This notice covers Arcel’s public website, mobile app, and related services. Health and injury information deserves particular care; a separate Consumer Health Privacy Policy provides additional detail.

## Controller, contact, and scope

[CONFIRM: full legal operator name], at [CONFIRM: public business mailing address and country], is responsible for deciding how Arcel processes personal information. Contact our privacy contact at [CONFIRM: monitored support and privacy email]. Effective date: [CONFIRM: effective date after publication review].

This notice covers information processed in operating Arcel, including information received directly from you, generated through your use, and supplied by service providers acting for us. Independent websites you choose to visit have their own notices. Where a regional privacy law applies, its mandatory requirements and the relevant sections below also apply.

- [Consumer Health Privacy Policy](./health-privacy.md)

## Account and contact information

When you register, we collect your email address, account identifier, authentication information, and account timestamps. You may provide a display name. We record your timezone for account and scheduling features. Our authentication provider processes your password, verification and recovery messages, and sign-in session information. Do not send passwords in chat or support requests.

If you contact us, we receive your contact information, the message and attachments you choose to send, and records needed to respond. If you exercise a privacy right, we also process the limited information necessary to verify and handle the request.

## Information you need to provide

You can read the public website without an account. Creating an email-based account requires an email address and authentication credentials; without them we cannot create or secure that account. If you choose Google sign-in, Google and Supabase provide the identifiers, email address, and available profile information authorized in that sign-in flow; Google processes the authentication under its own privacy notice. Arcel does not receive your Google password.

The current mobile interface requires finishing setup before entering the main app. You can continue through the questions without changing their preselected answers; saving setup stores those values, including defaults for fitness capacity and pain status. The current interface has no separate decline option for those fixed-choice questions. Your display name and free-text note are optional; skipping the note does not skip the other saved answers. A chat question is needed to answer that question.

[IMPLEMENT BEFORE PUBLICATION: provide meaningful choices for health information and separate permissions for third-party AI processing. Prefilled answers are not consent and must not be treated as a verified statement about your health.] Permission for third-party AI processing and any necessary health-data consent must be separate from accepting the Terms. Declining must prevent the dependent processing while leaving public information accessible. There is no general legal obligation to provide health information to Arcel.

## Training, health, and conversation information

We collect the onboarding answers and content you submit. Information may reveal your health even when you describe it as fitness information. Please provide only what is relevant to the feature you use and avoid identifying other people.

- Training preferences and circumstances: goals, preferred sports or cardio, training experience, equipment, available days, session length, and schedule.
- Fitness and health-related information: saved onboarding values for push-up or running capacity and current pain or limitations, including preselected defaults if left unchanged; and injury history or other health and recovery information you choose to include in notes or messages.
- Conversation content: prompts, messages, conversation titles, AI replies, retrieved references, and related timestamps and identifiers.
- When you use live training features: scheduled workouts and sports sessions, exercises, sets, repetitions, load, distance, duration, effort ratings, rest, completion status, and notes. Screens labeled as previews may display example records rather than saved personal records.
- Derived information: generated training suggestions, plans, summaries, and inferences about training needs or capacity. Such inferences can be wrong and may constitute health information.

## Technical information and sources

Our hosting, authentication, and security providers process information necessary to deliver requests, such as IP address, request time, requested resource, browser or device information supplied with a request, response status, and authentication or security events. Diagnostics can include error messages, performance measurements, service metadata, and identifiers. Where workflow tracing is enabled, it can also include AI inputs and outputs, as described below.

We receive personal information from you and your device, from the use of our Services, from the service providers supporting those interactions, and from inferences generated for your account. Research papers and web results come from public or licensed sources; we do not use them to build a separate personal dossier about you.

The current app does not connect to Apple Health, HealthKit, wearables, device contacts, your photo library, microphone, or precise device location. Timezone is not precise location. A future integration would require updated disclosures and any required permission before collection.

## Why we process information

We use information for the following purposes, limited to what is reasonably needed for the activity:

- Create and authenticate accounts, maintain profiles, save onboarding answers and conversations, and provide access across sessions.
- Respond to questions, retrieve relevant research, generate personalized information, and provide live planning or workout features you request.
- Keep the Services reliable and secure, detect abuse, investigate errors, and troubleshoot support requests.
- Communicate about account access, material service or policy changes, support, and security.
- Handle privacy requests, maintain necessary consent records, satisfy legal duties, and establish or defend legal claims where permitted.

## AI providers, retrieval, and search

Arcel sends prompts, relevant conversation history, and relevant account or onboarding context to OpenAI to generate and evaluate responses. Training information or health details contained in that context can be included. For research retrieval, Arcel’s backend generates an embedding, a numerical representation of a search question.

Research retrieval uses Chroma Cloud, which can receive query embeddings and search metadata. Web research uses Tavily, which receives search queries derived from your request; those queries can contain health or other personal details if present in the request. Where a workflow uses Cohere reranking, Cohere receives the query and candidate research passages to rank them. Cohere is not used in every workflow.

We must clearly disclose the applicable recipients and obtain any required explicit permission before sending personal information to third-party AI services. Reading this policy or accepting the Terms does not replace that permission. Avoid entering information you do not want processed for the requested AI feature.

Arcel does not use your private health data or conversations to train its own general-purpose AI model. We do not authorize providers to use that content for unrelated model training. Provider retention, safety review, and processing depend on the service, contract, and account configuration; this is not a promise of zero retention or that no person at a provider can ever access data. [CONFIRM BEFORE PUBLICATION: each production provider’s contractual restrictions, training settings, retention, subprocessors, and permission flow.]

## Service providers and information they receive

We use the following categories of providers. Access is limited to the purpose of the service and applicable legal requirements. Providers processing information on our behalf must be subject to agreements requiring confidentiality, appropriate security, purpose restrictions, and protection at least equivalent to the commitments in this policy. [CONFIRM BEFORE PUBLICATION: verify the contracts and current production services, including any providers enabled outside this repository.]

- Supabase — account authentication and database hosting for profile, onboarding, conversation, and live training records.
- Google Cloud — backend computing, network security, operational logs, and storage supporting Arcel. User requests and application data pass through the backend; research source storage is separate from the user account database.
- Vercel — public website hosting and delivery, including website request and security data. Browsing the public website does not itself submit your saved app conversations to the website.
- OpenAI, Chroma Cloud, Tavily, and, when used, Cohere — the AI, embedding, retrieval, and search data described in the previous section.
- Sentry, when enabled — backend error and performance monitoring. Our integration disables default personal-data collection, request bodies, and local-variable capture; this does not guarantee every error or event is free of personal information.
- LangSmith, when workflow tracing is enabled — AI workflow inputs, outputs, and execution information. These traces may contain conversation or health information. Hiding metadata alone does not remove that content.
- Support or professional advisers — information needed to address your request or obtain confidential legal, accounting, or security advice. Any additional support provider must be included in our provider review before receiving data.

## Other disclosures and uses we prohibit

We may disclose information where reasonably necessary and legally permitted to comply with a binding legal obligation, protect rights or safety, investigate fraud, or respond to a valid request from an authority. We assess the request and limit disclosure to what is required. A business transfer may involve information only subject to applicable law, continuing privacy protections, and any required notice or consent. Health-data restrictions continue to apply.

We do not sell personal information, rent health information, share personal information for cross-context behavioral advertising, or use health information for targeted advertising. We do not provide private workout or health records to employers, insurers, or data brokers for their independent decisions. We do not currently disclose health information to corporate affiliates. [CONFIRM BEFORE PUBLICATION: business practices and whether any affiliate actually receives data.]

We do not treat a broad business-transfer clause, acceptance of our Terms, or a vendor relationship as permission for a new health-data use.

## Cookies, local storage, and tracking choices

The mobile app stores authentication session information on your device so you can stay signed in. Some profile, conversation, and calendar information is cached in memory while the app runs. Signing out or uninstalling the app does not delete server-side account records.

The public website does not currently use advertising pixels or optional cross-site behavioral analytics in its application code. Hosting and security providers still process website requests. Authenticated web functionality, if made available, may use local storage or similar technology for sign-in and preferences. [CONFIRM BEFORE PUBLICATION: audit hosting dashboards, cookies, and all production scripts; code inspection alone cannot establish their behavior.]

We do not track you across unrelated websites for advertising or authorize other parties to do so through our Services. Our current site does not change its behavior in response to a browser’s Do Not Track setting because it does not perform that tracking. Global Privacy Control is a separate signal: where applicable law requires it, it operates as an opt-out of sale or sharing; because we do neither, there is no sale or advertising-sharing activity to opt out of. We must implement any additional legally required signal handling before introducing a relevant activity. Nonessential cookies or similar access will require prior consent where the law requires it.

## How long information is retained

We keep personal information only for as long as reasonably necessary for its stated purpose, subject to a valid deletion request and legal retention duties. Retention depends on the type of data, the feature you use, whether your account remains active, the sensitivity of the data, and any applicable legal deadline. We do not use an indefinite possibility of future use as a retention reason.

- Account and profile records: while needed to provide and secure your account, followed by deletion or restricted retention only where a legal duty or another lawful exception requires it.
- Onboarding, conversations, and live training history: while needed to provide the saved history and personalized features you request, unless you request earlier deletion or the information is no longer needed.
- Diagnostics, search requests, and workflow traces: for the limited troubleshooting, security, and provider-processing periods appropriate to the purpose. These periods must be verified in production; no fixed vendor deletion period is represented here.
- Support, consent, and rights-request records: only as needed to resolve the issue and demonstrate compliance or address a relevant legal claim, with access restricted.
- Backups: the required launch process is to isolate deleted data from ordinary use and remove it through the applicable deletion cycle, and reapply deletion instructions if restoration occurs. [CONFIRM BEFORE PUBLICATION: backup isolation, expiry, and restoration handling are not verified.] Consumer-health laws impose additional deadlines, as explained in the health policy and Nevada supplement below.

## Security and international processing

We use measures appropriate to the data and risks, including authenticated access, access restrictions, and encrypted network connections for account and backend traffic. No system is completely secure. We will investigate security incidents and provide notices to affected people and authorities when required by law.

Our service providers may process information in the United States and other countries where they and their subprocessors operate. Those countries may have different privacy laws, and lawful authorities may access data there. We do not promise that all information stays in your country. [CONFIRM BEFORE PUBLICATION: the operator’s location, hosting regions, provider locations, and transfer arrangements.]

Where EEA, UK, or Swiss law requires a transfer safeguard, we must use an applicable adequacy mechanism or appropriate contractual safeguards, such as the relevant standard contractual clauses, with any required assessment and supplementary measures. We do not claim a specific safeguard is in force until verified. You may contact us for information or a copy of relevant safeguards, with confidential commercial information redacted where lawful.

## Access, correction, deletion, and consent choices

You can view your available profile and saved conversations in the app and update information through the controls that are provided. Contact [CONFIRM: monitored support and privacy email] to request access, a copy, correction, deletion, withdrawal of consent, or information about recipients. Describe the request and the account concerned; do not include your password or unnecessary medical documents.

We use reasonable, proportionate verification to protect your information. An authorized agent may act where the law allows, subject to proof of authorization. We will not discriminate against you for exercising a privacy right. A feature may be unavailable if it cannot operate without the data you have asked us to stop using. Withdrawal does not invalidate processing that was lawful before withdrawal.

You can delete a saved conversation using its in-app menu; this removes the conversation and its messages from the active application database. It does not itself establish deletion of separate provider logs or backups. Deleting the app does not delete your server-side account. Account deletion must cover associated personal information except information we are legally permitted or required to retain. We will explain any refusal or retention exception and available review rights. [IMPLEMENT BEFORE PUBLICATION: the current app has no account-deletion control or provider-deletion workflow; add and test them, and identify the in-app path here.]

We respond within the deadline that applies to your request. EEA and UK requests ordinarily receive a response within one month, with up to two additional months where permitted and notified within the first month. Other jurisdictions have different periods; the health policy describes Washington rights, and the Nevada supplement below describes Nevada rights. You may contact your privacy regulator without first contacting us.

## United States state privacy rights

If a state privacy law applies to our processing of your information, you may have rights to confirm processing, access and obtain a portable copy, correct, delete, opt out of sale or targeted advertising, limit certain sensitive-data uses, or opt out of certain profiling. Rights and exceptions vary by state and by whether the law covers our business. We do not make decisions about legal rights, employment, credit, or insurance eligibility through Arcel’s training recommendations.

California: categories described above can include identifiers, account records, internet or network activity, health-related information, user content, and inferences. The same sections describe their sources, purposes, retention criteria, and provider categories. Sensitive information may include account credentials and health information. We use it to provide the requested Services and permitted security or legal functions, not to build advertising profiles. We do not sell or share personal information for cross-context behavioral advertising, including that of people under 16. We do not disclose personal information for a third party’s own direct marketing.

[CONFIRM BEFORE PUBLICATION: whether the CCPA/CPRA applies; if it does, validate the preceding 12 months of actual category-by-category collection and disclosures and publish the required notice at collection and request methods. This draft is not a verified 12-month disclosure.]

Where you have an appeal right, reply to a decision or contact [CONFIRM: monitored support and privacy email] with “Privacy appeal.” We will explain our decision and the regulator complaint route within the applicable statutory period. Consumer-health rights may apply even if a general state privacy law’s business-size threshold is not met.

## Nevada consumer health data supplement

If Nevada’s consumer health law applies, the health information we collect includes your reported condition or limitations, fitness and activity records, health-related communications, generated health inferences, and linked identifiers. These come from you, your use of Arcel, and the inferences generated for you. We process them electronically to provide the requested fitness features, store records, retrieve research, respond to you, and perform only other uses permitted by the applicable health law. The collection, purpose, AI, and provider sections above identify the specific data flows and recipient categories. We do not sell consumer health data, use it for advertising, or permit third parties to collect it through Arcel to track your activity over time across unrelated services.

You may request confirmation of collection, sharing, or sale; a list of all third parties with which your consumer health data was shared or sold; cessation of collection, sharing, or sale; and deletion. You may review available records in the app and request correction through [CONFIRM: monitored support and privacy email]. Use that same contact for health-data requests and appeals. We authenticate requests reasonably without demanding unnecessary health information.

We ordinarily respond within 45 days after authentication, with one further 45-day period where permitted and explained within the initial period. Deletion has a shorter deadline: covered data is deleted within 30 days after authentication, and recipients are notified of their obligation to delete within 30 days after notification. A permitted backup delay is limited by law to the period necessary for restoration and no more than two years; it does not authorize ordinary ongoing use. Any shorter applicable deadline controls. [CONFIRM BEFORE PUBLICATION: provider and backup deletion procedures and deadlines.]

If a request is denied, reply to the decision or send “Health privacy appeal” to [CONFIRM: monitored support and privacy email]. We respond with a written explanation within 45 days after receiving the appeal and provide a way to contact the Nevada Attorney General if we deny it. You can also complain directly. Material changes to these practices are notified as described in the last section of this policy, with fresh consent before new health-data processing where required.

- [Nevada Attorney General — file a complaint](https://ag.nv.gov/Complaints/File_Complaint/)

## EEA, United Kingdom, and Switzerland

This section applies where the relevant data-protection law governs our processing. Providing an account and the requested non-sensitive service generally relies on performance of our contract with you. Proportionate security, fraud prevention, and ordinary service administration may rely on our legitimate interests after considering your rights. Complying with a binding legal duty relies on that obligation. Optional activities that require permission rely on consent.

Health data requires an additional lawful condition. For ordinary direct-to-consumer personalization using health data, the proposed condition is your separate explicit consent, not merely contract necessity or a general legitimate interest. We must obtain and record that consent before processing and allow withdrawal. Any narrow legal-claims or other statutory exception requires a separate assessment. [CONFIRM BEFORE PUBLICATION: approved legal-basis mapping, health-consent flow, and any required EEA/UK representative or data-protection officer and their contact details.]

You may request access, rectification, erasure, restriction, portability where applicable, and object to legitimate-interest processing. You may always object to direct marketing and withdraw consent. You can complain to your competent supervisory authority. Training personalization uses automated processing to select or generate suggestions; it is not intended to determine legal rights or have similarly significant effects. Contact us to question an inference or correct its inputs. Any future use for a legally significant decision requires a new assessment and appropriate safeguards.

- [Find an EEA supervisory authority](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en)
- [UK Information Commissioner](https://ico.org.uk/make-a-complaint/)
- [Swiss data-protection authority](https://www.edoeb.admin.ch/)

## Your right to object

Where EEA, UK, or corresponding data-protection law applies, you can object to processing based on legitimate interests for reasons relating to your particular situation. We must stop unless we demonstrate overriding compelling grounds or processing is needed for legal claims as the law permits. You can object to direct marketing at any time, including related profiling, without giving a reason; we must stop that use. Contact [CONFIRM: monitored support and privacy email] with “Objection to processing.” This right is separate from withdrawing consent.

## Canada

Where Canadian privacy law applies, our privacy contact at [CONFIRM: monitored support and privacy email] is responsible for privacy inquiries. We identify purposes at or before collection and obtain the form of meaningful consent appropriate to the sensitivity of the information and reasonable expectations, subject to lawful exceptions. Health-related processing ordinarily requires express consent. You may request access and correction and withdraw consent subject to legal or contractual restrictions that we explain.

We remain accountable for information handled by service providers on our behalf, including when it is processed outside Canada. You may complain to us or the appropriate federal or provincial privacy commissioner. [CONFIRM BEFORE PUBLICATION: Canadian launch locations and any applicable provincial requirements, including Québec language, privacy impact assessment, and governance requirements.]

- [Office of the Privacy Commissioner of Canada](https://www.priv.gc.ca/en/report-a-concern/)

## Children and age eligibility

The proposed Services are intended for adults who meet the age requirement in the Terms. We do not knowingly invite children to create accounts or provide health information. If you believe a child has provided personal information, contact [CONFIRM: monitored support and privacy email] so we can investigate and take the steps required by law, including deletion where appropriate.

An adult-only statement does not replace age controls or our obligations if we become aware of a child’s data. [CONFIRM BEFORE PUBLICATION: launch age, age assurance, and handling of existing underage accounts.]

## Payments and marketing

The current development build does not collect payment-card details or implement subscriptions. If Apple purchases are added, Apple will process billing under its own terms and notice, and Arcel may receive transaction, product, entitlement, and renewal information needed to provide the purchase. We will update this notice before adding that processing.

We do not currently operate a marketing mailing list through the public website. If we introduce optional marketing, we will provide any required consent and an unsubscribe method. Essential account and security messages are separate from optional marketing.

## Consumer health protection and HIPAA

Arcel is a direct-to-consumer fitness service. Providing health information does not by itself make Arcel a healthcare provider or make the data subject to HIPAA. Other consumer-privacy and breach-notification laws can protect the information. We do not represent that Arcel is HIPAA-certified or a regulated medical-record system.

We do not operate geofences around healthcare facilities to identify or track people seeking care, collect consumer health data, or send health-related messages or advertisements.

## Changes and questions

We will post a revised notice with an effective date when our practices change. Material changes will be brought to existing users’ attention through the app, email, or another appropriate method before taking effect where required. If a new purpose, category, or recipient requires fresh consent, we will obtain it before the relevant processing; continued use alone is not that consent. Contact [CONFIRM: monitored support and privacy email] for questions or an accessible copy of this notice.
