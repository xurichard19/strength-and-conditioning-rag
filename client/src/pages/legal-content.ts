// Draft notices communicate publication status; deployment is not mechanically blocked.
// See legal/PUBLICATION-REVIEW.md before making these policies effective.
export type InfoSection = {
  heading: string
  body: string
  bullets?: string[]
  links?: Array<{ label: string; href: string }>
}

export type InfoContent = {
  eyebrow: string
  title: string
  status?: string
  updated?: string
  summary?: string
  sections: InfoSection[]
}

const operator = '[CONFIRM: full legal operator name]'
const address = '[CONFIRM: public business mailing address and country]'
const contact = '[CONFIRM: monitored support and privacy email]'
const effectiveDate = '[CONFIRM: effective date after publication review]'
const draft = {
  status: 'Draft for review. These policies describe the current application, but are not yet effective. Business details and launch decisions remain open; production-only settings need verification, and missing consent and account-deletion controls need implementation.',
  updated: 'Draft prepared September 19, 2026',
}

export const legalContent: Record<'terms' | 'privacy' | 'health-privacy' | 'disclaimer' | 'accessibility', InfoContent> = {
  terms: {
    ...draft,
    eyebrow: 'Legal',
    title: 'Terms of Service',
    summary: 'These terms explain the agreement for using Arcel, the limits of AI training guidance, and your rights and responsibilities.',
    sections: [
      {
        heading: 'Who we are and how to contact us',
        body: `Arcel is operated by ${operator}, located at ${address} (Arcel, we, us, or our). These Terms of Service govern our website, mobile application, and related services, together called the Services. Contact us at ${contact} about these terms, your account, or a complaint. Effective date: ${effectiveDate}.`,
      },
      {
        heading: 'Agreement and eligibility',
        body: 'When you affirmatively accept these terms during registration or another agreement flow, you enter into an agreement with the operator identified above. If you do not agree, do not create an account or use account-based Services. Merely reading our public information pages does not authorize health-data processing or AI sharing.\n\nThe proposed launch is for people who are at least 18 and have reached the age of majority where they live. You must use your own account and be legally able to enter this agreement. Arcel is not intended for children or for use on behalf of another athlete. [CONFIRM BEFORE PUBLICATION: adult-only eligibility and the corresponding age-check process.]',
      },
      {
        heading: 'What Arcel provides',
        body: 'Arcel provides AI-assisted strength and conditioning information, research summaries, conversations, and, where available, training planning and recording tools. The features available to you are those identified in the app or offer at the time you use or purchase them.\n\nDevelopment previews, example workouts, and proposed features do not promise a delivery date or working functionality. A preview that is labeled as sample data is not your saved training record. Automatic planning, refreshes, and adjustments may be unavailable while in development. We will clearly distinguish previews from live functionality.',
      },
      {
        heading: 'Fitness information and personal safety',
        body: 'Arcel provides general fitness and educational information. It does not provide medical care, diagnosis, treatment, rehabilitation, emergency monitoring, or clearance to exercise. Using Arcel does not create a clinician-patient relationship or a relationship with a human personal trainer. Describing an injury in chat does not mean a qualified professional has reviewed it.\n\nExercise can cause injury, illness, or other harm. Consider your circumstances, ability, environment, equipment, and any advice from a qualified professional before following a suggestion. Seek appropriate professional advice before exercising with an injury, medical condition, pregnancy, or other concern about exercise safety. Stop activity if it causes concerning symptoms and seek appropriate help. Contact local emergency services in an emergency; Arcel does not monitor messages for emergencies.\n\nYou acknowledge the ordinary risks of exercise. This acknowledgment does not release us from liability that cannot lawfully be excluded, including responsibility for our own conduct where applicable law prohibits a waiver.',
        links: [{ label: 'Read the Fitness Disclaimer', href: '/disclaimer' }],
      },
      {
        heading: 'AI outputs and research limitations',
        body: 'You interact with an artificial intelligence system. Responses and plans can be inaccurate, incomplete, outdated, unsuitable, or inconsistent even when they include citations. An AI can misread a source, invent a citation, or overlook information you provided. Research on a group of people may not apply to you. Neither a citation nor personalization is a guarantee of accuracy or safety.\n\nUse your judgment and check important information against the original source or a qualified professional. Do not use Arcel to make medical decisions or to disregard professional advice. We do not guarantee performance improvements, injury prevention, or other training outcomes. Outputs may resemble outputs supplied to other users.',
      },
      {
        heading: 'Accounts and security',
        body: 'Provide accurate account information, keep it reasonably current, and protect your password and access tokens. Do not share or sell your account, impersonate someone else, or allow someone else to submit information through your account. Tell us promptly if you suspect unauthorized access. You are responsible for activity you authorize; these terms do not make you automatically responsible for every unauthorized action beyond your control.\n\nAn internet connection and a compatible device may be necessary. Your network provider may charge for access. We may require reasonable security verification, updates, or reauthentication to protect your account.',
      },
      {
        heading: 'Privacy and separate permissions',
        body: 'Our Privacy Policy explains how we handle account information, conversations, fitness information, and other personal data. Our Consumer Health Privacy Policy addresses health-related information. These notices do not replace any separate consent or permission that the law or your device requires.\n\nAgreeing to these terms is not consent to optional marketing, sale of health information, or undisclosed sharing with AI services. Where permission is required, we must explain the relevant data and recipients and obtain that permission before processing. Declining or withdrawing a permission may make a feature that needs that information unavailable; it does not authorize unrelated use of your information.',
        links: [{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Consumer Health Privacy Policy', href: '/health-privacy' }],
      },
      {
        heading: 'Your content and generated results',
        body: 'You retain any ownership rights you have in the information and content you submit. You give Arcel a limited, nonexclusive permission to host, reproduce, process, transmit to disclosed service providers, and display that content only as necessary to provide the Services you request and for the other purposes lawfully described in our privacy notices. This permission does not authorize selling your health information, advertising with it, or training general-purpose AI models on it. Retention and deletion remain subject to the Privacy Policy and applicable law.\n\nSubmit only content you are entitled to provide. Do not submit someone else’s confidential or health information without appropriate authority. As between you and Arcel, you may use generated results for your own lawful purposes, subject to third-party rights and these terms. We do not promise that AI output qualifies for copyright protection, is unique, or is free of third-party rights. Third-party research remains subject to its own attribution and licensing terms.',
      },
      {
        heading: 'Permitted use',
        body: 'You may use the Services for your personal training and informational purposes, subject to these terms and applicable law. In particular, you must not:',
        bullets: [
          'Use the Services for unlawful, abusive, fraudulent, or harmful conduct; harassment; or infringement of another person’s rights.',
          'Seek access to another account, extract private information, upload malicious code, or interfere with security or availability.',
          'Bypass access controls, usage limits, or payment requirements, or use automated access that materially burdens the Services without permission.',
          'Present AI output as a diagnosis, professional approval, or a human expert’s advice, or use it to make decisions about another person’s healthcare, employment, credit, or insurance eligibility.',
          'Copy, resell, or redistribute Arcel’s proprietary software or branding without authorization, except where applicable law expressly permits the activity.',
        ],
      },
      {
        heading: 'Arcel software and third-party materials',
        body: 'Arcel and its licensors retain their rights in the application, website, design, branding, and other materials they provide, excluding your content and third-party materials. Subject to these terms, you receive a limited permission to access and use the Services for their intended purposes. Open-source software and research materials may be governed by separate licenses; those licenses control the relevant materials.\n\nLinks to papers, websites, and other services are provided for reference. We do not control those services or guarantee their availability or content. Their terms and privacy notices apply when you visit or use them. Our responsibility for personal data we send to our own service providers is addressed in our privacy notices and is not disclaimed by this section.',
      },
      {
        heading: 'Free access and future paid offers',
        body: 'The current development build does not implement paid subscriptions. Access during development does not promise permanent free access or an entitlement to future paid features. We will not charge you merely because a free feature becomes paid; a purchase requires an offer and your affirmative authorization.\n\nThe subscription provisions below apply only if Arcel actually offers you a subscription. Before purchase, the purchase screen must identify the included service, price and currency, billing period, automatic renewal, trial or promotional conditions, and cancellation method. The offer and mandatory consumer protections govern if they provide you more specific or stronger rights. [CONFIRM BEFORE PUBLICATION: whether launch includes paid plans, their billing provider, and all offer details.]',
      },
      {
        heading: 'Apple subscriptions, renewal, and cancellation',
        body: 'If you buy a subscription through Apple, Apple processes the payment using your Apple Account. Unless the offer expressly says otherwise, the subscription renews automatically for the disclosed period at the applicable disclosed price until canceled. Apple’s purchase confirmation states the billing terms. If you accept a trial that converts to a paid subscription, the trial offer must disclose when it ends and the price and period that follow.\n\nManage or cancel an Apple subscription in your Apple Account subscription settings. For an Apple free or discounted trial, cancel at least 24 hours before the trial ends if you do not want to renew. Cancellation generally stops future renewal; the purchase terms and applicable law determine when access ends and whether a refund is due. Deleting the app, signing out, or deleting your Arcel account does not itself cancel Apple billing.\n\nApple handles refund requests for Apple purchases, subject to applicable consumer rights. Nothing here excludes a statutory refund, withdrawal, or other remedy. Any price increase or renewal change must follow Apple’s notice and consent rules and applicable law. A future direct-billing offer must separately explain its cancellation and refund process before purchase.',
        links: [{ label: 'Manage Apple subscriptions', href: 'https://apps.apple.com/account/subscriptions' }, { label: 'Request an Apple refund', href: 'https://reportaproblem.apple.com/' }],
      },
      {
        heading: 'Apple application license',
        body: 'If you obtain Arcel from Apple’s App Store, Apple’s Standard Licensed Application End User License Agreement applies to the license for the iOS application unless a different license is expressly provided through App Store Connect. These Terms govern Arcel’s Services and do not purport to replace that application license. Apple is not the provider of Arcel’s training service. Mandatory consumer rights remain unaffected.',
        links: [{ label: 'Apple Standard End User License Agreement', href: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/' }],
      },
      {
        heading: 'Changes, interruptions, and service availability',
        body: 'We may maintain, update, or modify the Services, and availability may be affected by outages, third-party systems, or events outside our reasonable control. We will use reasonable care in operating the Services and give reasonable advance notice of a material reduction or discontinuation where practicable. Urgent security or legal changes may require immediate action.\n\nA change will not remove rights already accrued. If a change materially affects a paid service, we will provide the notice, cancellation opportunity, continued performance, or refund required by your purchase terms and applicable law. A description of future functionality is not an agreement to deliver it.',
      },
      {
        heading: 'Suspension, termination, and your data',
        body: `You may stop using Arcel and request account closure and deletion. The Privacy Policy describes data requests; you can contact ${contact}. Cancel any Apple subscription separately to stop renewal. [IMPLEMENT BEFORE PUBLICATION: the current app has no account-deletion control; add the control and its verified path here.]

We may suspend or terminate access for a material breach, serious abuse, security risk, legal requirement, or discontinuation of the Services. Where appropriate and lawful, we will explain the reason and give you a reasonable opportunity to resolve the issue. Contact us to challenge a mistake. Suspension or closure does not eliminate privacy rights or any refund required by law. We retain information after closure only as described in the Privacy Policy and permitted by law.`,
      },
      {
        heading: 'Warranties and responsibility',
        body: 'To the extent permitted by law, we do not make additional promises that the Services will be uninterrupted, error-free, suitable for every individual, or produce a particular training result. Any exclusion of implied warranties applies only where the law permits it.\n\nWe are responsible for loss to the extent required by applicable law. These terms do not exclude or limit liability for fraud, intentional misconduct, gross negligence where it cannot be excluded, death or personal injury caused by negligence where such liability cannot be limited, or any other non-excludable liability. They do not limit your rights to reasonable care, conformity, repair, replacement, refunds, or other mandatory consumer remedies. You are not asked to indemnify us for our own misconduct.',
      },
      {
        heading: 'Complaints, disputes, and applicable law',
        body: `Please contact ${contact} with a complaint so we can try to resolve it. Contacting us first is voluntary and does not delay a legal deadline or prevent you from seeking urgent relief, using small-claims procedures, or complaining to a regulator.

These terms do not impose mandatory arbitration, a class-action waiver, or an exclusive foreign court. Applicable law determines the governing law and competent courts. You retain any mandatory protection and right to bring proceedings in your place of residence that the law gives you.`,
      },
      {
        heading: 'Updates to these terms',
        body: 'We will post revised terms with an effective date. For material changes affecting existing users, we will provide reasonable advance notice through the app, email, or another appropriate channel, unless an urgent legal or security need requires a shorter period. Where affirmative agreement is necessary, we will request it. Changes are prospective and do not retroactively change an already arisen dispute.\n\nIf you do not accept a material change, you may stop using the affected Services, close your account, and exercise any cancellation or refund right available to you. A change to these terms is not a substitute for separate consent to a new use of personal or health data.',
      },
      {
        heading: 'Other agreement terms',
        body: 'If a provision is unenforceable, the remaining provisions continue to apply to the extent lawful. A delay in enforcing a right is not a waiver. We may transfer this agreement in a lawful business reorganization only if your existing rights and privacy protections are preserved; we will provide notice where required. You may not transfer your account without our permission, except where law permits.\n\nThese terms and any specific offer you accept describe the service agreement. Privacy notices explain processing and do not waive statutory rights. If a translation differs, mandatory local-language and consumer-protection requirements control.',
      },
    ],
  },
  privacy: {
    ...draft,
    eyebrow: 'Privacy',
    title: 'Privacy Policy',
    summary: 'This notice covers Arcel’s public website, mobile app, and related services. Health and injury information deserves particular care; a separate Consumer Health Privacy Policy provides additional detail.',
    sections: [
      {
        heading: 'Controller, contact, and scope',
        body: `${operator}, at ${address}, is responsible for deciding how Arcel processes personal information. Contact our privacy contact at ${contact}. Effective date: ${effectiveDate}.

This notice covers information processed in operating Arcel, including information received directly from you, generated through your use, and supplied by service providers acting for us. Independent websites you choose to visit have their own notices. Where a regional privacy law applies, its mandatory requirements and the relevant sections below also apply.`,
        links: [{ label: 'Consumer Health Privacy Policy', href: '/health-privacy' }],
      },
      {
        heading: 'Account and contact information',
        body: 'When you register, we collect your email address, account identifier, authentication information, and account timestamps. You may provide a display name. We record your timezone for account and scheduling features. Our authentication provider processes your password, verification and recovery messages, and sign-in session information. Do not send passwords in chat or support requests.\n\nIf you contact us, we receive your contact information, the message and attachments you choose to send, and records needed to respond. If you exercise a privacy right, we also process the limited information necessary to verify and handle the request.',
      },
      {
        heading: 'Information you need to provide',
        body: 'You can read the public website without an account. Creating an email-based account requires an email address and authentication credentials; without them we cannot create or secure that account. If you choose Google sign-in, Google and Supabase provide the identifiers, email address, and available profile information authorized in that sign-in flow; Google processes the authentication under its own privacy notice. Arcel does not receive your Google password.\n\nThe current mobile interface requires finishing setup before entering the main app. You can continue through the questions without changing their preselected answers; saving setup stores those values, including defaults for fitness capacity and pain status. The current interface has no separate decline option for those fixed-choice questions. Your display name and free-text note are optional; skipping the note does not skip the other saved answers. A chat question is needed to answer that question.\n\n[IMPLEMENT BEFORE PUBLICATION: provide meaningful choices for health information and separate permissions for third-party AI processing. Prefilled answers are not consent and must not be treated as a verified statement about your health.] Permission for third-party AI processing and any necessary health-data consent must be separate from accepting the Terms. Declining must prevent the dependent processing while leaving public information accessible. There is no general legal obligation to provide health information to Arcel.',
      },
      {
        heading: 'Training, health, and conversation information',
        body: 'We collect the onboarding answers and content you submit. Information may reveal your health even when you describe it as fitness information. Please provide only what is relevant to the feature you use and avoid identifying other people.',
        bullets: [
          'Training preferences and circumstances: goals, preferred sports or cardio, training experience, equipment, available days, session length, and schedule.',
          'Fitness and health-related information: saved onboarding values for push-up or running capacity and current pain or limitations, including preselected defaults if left unchanged; and injury history or other health and recovery information you choose to include in notes or messages.',
          'Conversation content: prompts, messages, conversation titles, AI replies, retrieved references, and related timestamps and identifiers.',
          'When you use live training features: scheduled workouts and sports sessions, exercises, sets, repetitions, load, distance, duration, effort ratings, rest, completion status, and notes. Screens labeled as previews may display example records rather than saved personal records.',
          'Derived information: generated training suggestions, plans, summaries, and inferences about training needs or capacity. Such inferences can be wrong and may constitute health information.',
        ],
      },
      {
        heading: 'Technical information and sources',
        body: 'Our hosting, authentication, and security providers process information necessary to deliver requests, such as IP address, request time, requested resource, browser or device information supplied with a request, response status, and authentication or security events. Diagnostics can include error messages, performance measurements, service metadata, and identifiers. Where workflow tracing is enabled, it can also include AI inputs and outputs, as described below.\n\nWe receive personal information from you and your device, from the use of our Services, from the service providers supporting those interactions, and from inferences generated for your account. Research papers and web results come from public or licensed sources; we do not use them to build a separate personal dossier about you.\n\nThe current app does not connect to Apple Health, HealthKit, wearables, device contacts, your photo library, microphone, or precise device location. Timezone is not precise location. A future integration would require updated disclosures and any required permission before collection.',
      },
      {
        heading: 'Why we process information',
        body: 'We use information for the following purposes, limited to what is reasonably needed for the activity:',
        bullets: [
          'Create and authenticate accounts, maintain profiles, save onboarding answers and conversations, and provide access across sessions.',
          'Respond to questions, retrieve relevant research, generate personalized information, and provide live planning or workout features you request.',
          'Keep the Services reliable and secure, detect abuse, investigate errors, and troubleshoot support requests.',
          'Communicate about account access, material service or policy changes, support, and security.',
          'Handle privacy requests, maintain necessary consent records, satisfy legal duties, and establish or defend legal claims where permitted.',
        ],
      },
      {
        heading: 'AI providers, retrieval, and search',
        body: 'Arcel sends prompts, relevant conversation history, and relevant account or onboarding context to OpenAI to generate and evaluate responses. Training information or health details contained in that context can be included. For research retrieval, Arcel’s backend generates an embedding, a numerical representation of a search question.\n\nResearch retrieval uses Chroma Cloud, which can receive query embeddings and search metadata. Web research uses Tavily, which receives search queries derived from your request; those queries can contain health or other personal details if present in the request. Where a workflow uses Cohere reranking, Cohere receives the query and candidate research passages to rank them. Cohere is not used in every workflow.\n\nWe must clearly disclose the applicable recipients and obtain any required explicit permission before sending personal information to third-party AI services. Reading this policy or accepting the Terms does not replace that permission. Avoid entering information you do not want processed for the requested AI feature.\n\nArcel does not use your private health data or conversations to train its own general-purpose AI model. We do not authorize providers to use that content for unrelated model training. Provider retention, safety review, and processing depend on the service, contract, and account configuration; this is not a promise of zero retention or that no person at a provider can ever access data. [CONFIRM BEFORE PUBLICATION: each production provider’s contractual restrictions, training settings, retention, subprocessors, and permission flow.]',
      },
      {
        heading: 'Service providers and information they receive',
        body: 'We use the following categories of providers. Access is limited to the purpose of the service and applicable legal requirements. Providers processing information on our behalf must be subject to agreements requiring confidentiality, appropriate security, purpose restrictions, and protection at least equivalent to the commitments in this policy. [CONFIRM BEFORE PUBLICATION: verify the contracts and current production services, including any providers enabled outside this repository.]',
        bullets: [
          'Supabase — account authentication and database hosting for profile, onboarding, conversation, and live training records.',
          'Google Cloud — backend computing, network security, operational logs, and storage supporting Arcel. User requests and application data pass through the backend; research source storage is separate from the user account database.',
          'Vercel — public website hosting and delivery, including website request and security data. Browsing the public website does not itself submit your saved app conversations to the website.',
          'OpenAI, Chroma Cloud, Tavily, and, when used, Cohere — the AI, embedding, retrieval, and search data described in the previous section.',
          'Sentry, when enabled — backend error and performance monitoring. Our integration disables default personal-data collection, request bodies, and local-variable capture; this does not guarantee every error or event is free of personal information.',
          'LangSmith, when workflow tracing is enabled — AI workflow inputs, outputs, and execution information. These traces may contain conversation or health information. Hiding metadata alone does not remove that content.',
          'Support or professional advisers — information needed to address your request or obtain confidential legal, accounting, or security advice. Any additional support provider must be included in our provider review before receiving data.',
        ],
      },
      {
        heading: 'Other disclosures and uses we prohibit',
        body: 'We may disclose information where reasonably necessary and legally permitted to comply with a binding legal obligation, protect rights or safety, investigate fraud, or respond to a valid request from an authority. We assess the request and limit disclosure to what is required. A business transfer may involve information only subject to applicable law, continuing privacy protections, and any required notice or consent. Health-data restrictions continue to apply.\n\nWe do not sell personal information, rent health information, share personal information for cross-context behavioral advertising, or use health information for targeted advertising. We do not provide private workout or health records to employers, insurers, or data brokers for their independent decisions. We do not currently disclose health information to corporate affiliates. [CONFIRM BEFORE PUBLICATION: business practices and whether any affiliate actually receives data.]\n\nWe do not treat a broad business-transfer clause, acceptance of our Terms, or a vendor relationship as permission for a new health-data use.',
      },
      {
        heading: 'Cookies, local storage, and tracking choices',
        body: 'The mobile app stores authentication session information on your device so you can stay signed in. Some profile, conversation, and calendar information is cached in memory while the app runs. Signing out or uninstalling the app does not delete server-side account records.\n\nThe public website does not currently use advertising pixels or optional cross-site behavioral analytics in its application code. Hosting and security providers still process website requests. Authenticated web functionality, if made available, may use local storage or similar technology for sign-in and preferences. [CONFIRM BEFORE PUBLICATION: audit hosting dashboards, cookies, and all production scripts; code inspection alone cannot establish their behavior.]\n\nWe do not track you across unrelated websites for advertising or authorize other parties to do so through our Services. Our current site does not change its behavior in response to a browser’s Do Not Track setting because it does not perform that tracking. Global Privacy Control is a separate signal: where applicable law requires it, it operates as an opt-out of sale or sharing; because we do neither, there is no sale or advertising-sharing activity to opt out of. We must implement any additional legally required signal handling before introducing a relevant activity. Nonessential cookies or similar access will require prior consent where the law requires it.',
      },
      {
        heading: 'How long information is retained',
        body: 'We keep personal information only for as long as reasonably necessary for its stated purpose, subject to a valid deletion request and legal retention duties. Retention depends on the type of data, the feature you use, whether your account remains active, the sensitivity of the data, and any applicable legal deadline. We do not use an indefinite possibility of future use as a retention reason.',
        bullets: [
          'Account and profile records: while needed to provide and secure your account, followed by deletion or restricted retention only where a legal duty or another lawful exception requires it.',
          'Onboarding, conversations, and live training history: while needed to provide the saved history and personalized features you request, unless you request earlier deletion or the information is no longer needed.',
          'Diagnostics, search requests, and workflow traces: for the limited troubleshooting, security, and provider-processing periods appropriate to the purpose. These periods must be verified in production; no fixed vendor deletion period is represented here.',
          'Support, consent, and rights-request records: only as needed to resolve the issue and demonstrate compliance or address a relevant legal claim, with access restricted.',
          'Backups: the required launch process is to isolate deleted data from ordinary use and remove it through the applicable deletion cycle, and reapply deletion instructions if restoration occurs. [CONFIRM BEFORE PUBLICATION: backup isolation, expiry, and restoration handling are not verified.] Consumer-health laws impose additional deadlines, as explained in the health policy and Nevada supplement below.',
        ],
      },
      {
        heading: 'Security and international processing',
        body: 'We use measures appropriate to the data and risks, including authenticated access, access restrictions, and encrypted network connections for account and backend traffic. No system is completely secure. We will investigate security incidents and provide notices to affected people and authorities when required by law.\n\nOur service providers may process information in the United States and other countries where they and their subprocessors operate. Those countries may have different privacy laws, and lawful authorities may access data there. We do not promise that all information stays in your country. [CONFIRM BEFORE PUBLICATION: the operator’s location, hosting regions, provider locations, and transfer arrangements.]\n\nWhere EEA, UK, or Swiss law requires a transfer safeguard, we must use an applicable adequacy mechanism or appropriate contractual safeguards, such as the relevant standard contractual clauses, with any required assessment and supplementary measures. We do not claim a specific safeguard is in force until verified. You may contact us for information or a copy of relevant safeguards, with confidential commercial information redacted where lawful.',
      },
      {
        heading: 'Access, correction, deletion, and consent choices',
        body: `You can view your available profile and saved conversations in the app and update information through the controls that are provided. Contact ${contact} to request access, a copy, correction, deletion, withdrawal of consent, or information about recipients. Describe the request and the account concerned; do not include your password or unnecessary medical documents.

We use reasonable, proportionate verification to protect your information. An authorized agent may act where the law allows, subject to proof of authorization. We will not discriminate against you for exercising a privacy right. A feature may be unavailable if it cannot operate without the data you have asked us to stop using. Withdrawal does not invalidate processing that was lawful before withdrawal.

You can delete a saved conversation using its in-app menu; this removes the conversation and its messages from the active application database. It does not itself establish deletion of separate provider logs or backups. Deleting the app does not delete your server-side account. Account deletion must cover associated personal information except information we are legally permitted or required to retain. We will explain any refusal or retention exception and available review rights. [IMPLEMENT BEFORE PUBLICATION: the current app has no account-deletion control or provider-deletion workflow; add and test them, and identify the in-app path here.]

We respond within the deadline that applies to your request. EEA and UK requests ordinarily receive a response within one month, with up to two additional months where permitted and notified within the first month. Other jurisdictions have different periods; the health policy describes Washington rights, and the Nevada supplement below describes Nevada rights. You may contact your privacy regulator without first contacting us.`,
      },
      {
        heading: 'United States state privacy rights',
        body: `If a state privacy law applies to our processing of your information, you may have rights to confirm processing, access and obtain a portable copy, correct, delete, opt out of sale or targeted advertising, limit certain sensitive-data uses, or opt out of certain profiling. Rights and exceptions vary by state and by whether the law covers our business. We do not make decisions about legal rights, employment, credit, or insurance eligibility through Arcel’s training recommendations.

California: categories described above can include identifiers, account records, internet or network activity, health-related information, user content, and inferences. The same sections describe their sources, purposes, retention criteria, and provider categories. Sensitive information may include account credentials and health information. We use it to provide the requested Services and permitted security or legal functions, not to build advertising profiles. We do not sell or share personal information for cross-context behavioral advertising, including that of people under 16. We do not disclose personal information for a third party’s own direct marketing.

[CONFIRM BEFORE PUBLICATION: whether the CCPA/CPRA applies; if it does, validate the preceding 12 months of actual category-by-category collection and disclosures and publish the required notice at collection and request methods. This draft is not a verified 12-month disclosure.]

Where you have an appeal right, reply to a decision or contact ${contact} with “Privacy appeal.” We will explain our decision and the regulator complaint route within the applicable statutory period. Consumer-health rights may apply even if a general state privacy law’s business-size threshold is not met.`,
      },
      {
        heading: 'Nevada consumer health data supplement',
        body: `If Nevada’s consumer health law applies, the health information we collect includes your reported condition or limitations, fitness and activity records, health-related communications, generated health inferences, and linked identifiers. These come from you, your use of Arcel, and the inferences generated for you. We process them electronically to provide the requested fitness features, store records, retrieve research, respond to you, and perform only other uses permitted by the applicable health law. The collection, purpose, AI, and provider sections above identify the specific data flows and recipient categories. We do not sell consumer health data, use it for advertising, or permit third parties to collect it through Arcel to track your activity over time across unrelated services.

You may request confirmation of collection, sharing, or sale; a list of all third parties with which your consumer health data was shared or sold; cessation of collection, sharing, or sale; and deletion. You may review available records in the app and request correction through ${contact}. Use that same contact for health-data requests and appeals. We authenticate requests reasonably without demanding unnecessary health information.

We ordinarily respond within 45 days after authentication, with one further 45-day period where permitted and explained within the initial period. Deletion has a shorter deadline: covered data is deleted within 30 days after authentication, and recipients are notified of their obligation to delete within 30 days after notification. A permitted backup delay is limited by law to the period necessary for restoration and no more than two years; it does not authorize ordinary ongoing use. Any shorter applicable deadline controls. [CONFIRM BEFORE PUBLICATION: provider and backup deletion procedures and deadlines.]

If a request is denied, reply to the decision or send “Health privacy appeal” to ${contact}. We respond with a written explanation within 45 days after receiving the appeal and provide a way to contact the Nevada Attorney General if we deny it. You can also complain directly. Material changes to these practices are notified as described in the last section of this policy, with fresh consent before new health-data processing where required.`,
        links: [{ label: 'Nevada Attorney General — file a complaint', href: 'https://ag.nv.gov/Complaints/File_Complaint/' }],
      },
      {
        heading: 'EEA, United Kingdom, and Switzerland',
        body: 'This section applies where the relevant data-protection law governs our processing. Providing an account and the requested non-sensitive service generally relies on performance of our contract with you. Proportionate security, fraud prevention, and ordinary service administration may rely on our legitimate interests after considering your rights. Complying with a binding legal duty relies on that obligation. Optional activities that require permission rely on consent.\n\nHealth data requires an additional lawful condition. For ordinary direct-to-consumer personalization using health data, the proposed condition is your separate explicit consent, not merely contract necessity or a general legitimate interest. We must obtain and record that consent before processing and allow withdrawal. Any narrow legal-claims or other statutory exception requires a separate assessment. [CONFIRM BEFORE PUBLICATION: approved legal-basis mapping, health-consent flow, and any required EEA/UK representative or data-protection officer and their contact details.]\n\nYou may request access, rectification, erasure, restriction, portability where applicable, and object to legitimate-interest processing. You may always object to direct marketing and withdraw consent. You can complain to your competent supervisory authority. Training personalization uses automated processing to select or generate suggestions; it is not intended to determine legal rights or have similarly significant effects. Contact us to question an inference or correct its inputs. Any future use for a legally significant decision requires a new assessment and appropriate safeguards.',
        links: [{ label: 'Find an EEA supervisory authority', href: 'https://www.edpb.europa.eu/about-edpb/about-edpb/members_en' }, { label: 'UK Information Commissioner', href: 'https://ico.org.uk/make-a-complaint/' }, { label: 'Swiss data-protection authority', href: 'https://www.edoeb.admin.ch/' }],
      },
      {
        heading: 'Your right to object',
        body: `Where EEA, UK, or corresponding data-protection law applies, you can object to processing based on legitimate interests for reasons relating to your particular situation. We must stop unless we demonstrate overriding compelling grounds or processing is needed for legal claims as the law permits. You can object to direct marketing at any time, including related profiling, without giving a reason; we must stop that use. Contact ${contact} with “Objection to processing.” This right is separate from withdrawing consent.`,
      },
      {
        heading: 'Canada',
        body: `Where Canadian privacy law applies, our privacy contact at ${contact} is responsible for privacy inquiries. We identify purposes at or before collection and obtain the form of meaningful consent appropriate to the sensitivity of the information and reasonable expectations, subject to lawful exceptions. Health-related processing ordinarily requires express consent. You may request access and correction and withdraw consent subject to legal or contractual restrictions that we explain.

We remain accountable for information handled by service providers on our behalf, including when it is processed outside Canada. You may complain to us or the appropriate federal or provincial privacy commissioner. [CONFIRM BEFORE PUBLICATION: Canadian launch locations and any applicable provincial requirements, including Québec language, privacy impact assessment, and governance requirements.]`,
        links: [{ label: 'Office of the Privacy Commissioner of Canada', href: 'https://www.priv.gc.ca/en/report-a-concern/' }],
      },
      {
        heading: 'Children and age eligibility',
        body: `The proposed Services are intended for adults who meet the age requirement in the Terms. We do not knowingly invite children to create accounts or provide health information. If you believe a child has provided personal information, contact ${contact} so we can investigate and take the steps required by law, including deletion where appropriate.

An adult-only statement does not replace age controls or our obligations if we become aware of a child’s data. [CONFIRM BEFORE PUBLICATION: launch age, age assurance, and handling of existing underage accounts.]`,
      },
      {
        heading: 'Payments and marketing',
        body: 'The current development build does not collect payment-card details or implement subscriptions. If Apple purchases are added, Apple will process billing under its own terms and notice, and Arcel may receive transaction, product, entitlement, and renewal information needed to provide the purchase. We will update this notice before adding that processing.\n\nWe do not currently operate a marketing mailing list through the public website. If we introduce optional marketing, we will provide any required consent and an unsubscribe method. Essential account and security messages are separate from optional marketing.',
      },
      {
        heading: 'Consumer health protection and HIPAA',
        body: 'Arcel is a direct-to-consumer fitness service. Providing health information does not by itself make Arcel a healthcare provider or make the data subject to HIPAA. Other consumer-privacy and breach-notification laws can protect the information. We do not represent that Arcel is HIPAA-certified or a regulated medical-record system.\n\nWe do not operate geofences around healthcare facilities to identify or track people seeking care, collect consumer health data, or send health-related messages or advertisements.',
      },
      {
        heading: 'Changes and questions',
        body: `We will post a revised notice with an effective date when our practices change. Material changes will be brought to existing users’ attention through the app, email, or another appropriate method before taking effect where required. If a new purpose, category, or recipient requires fresh consent, we will obtain it before the relevant processing; continued use alone is not that consent. Contact ${contact} for questions or an accessible copy of this notice.`,
      },
    ],
  },
  'health-privacy': {
    ...draft,
    eyebrow: 'Health privacy',
    title: 'Consumer Health Privacy Policy',
    summary: 'This separate notice addresses consumer health data under Washington’s My Health My Data Act. Nevada’s health-data supplement appears in the general Privacy Policy.',
    sections: [
      {
        heading: 'Responsible entity and coverage',
        body: `${operator}, at ${address}, operates Arcel. Contact ${contact} for health-data questions and requests. Effective date: ${effectiveDate}.

Consumer health data is personal information that identifies, or can reasonably be linked to, a person and reveals physical or mental health status or related information under Washington’s My Health My Data Act. Fitness information and AI inferences can fall within that definition. This notice covers processing subject to that Act, including data about Washington residents and other people whose consumer health data is collected in Washington, within the Act’s scope.`,
      },
      {
        heading: 'Categories collected and their sources',
        body: 'We collect health-related information directly from your onboarding answers, notes, conversations, and live training records. We also generate health-related inferences from that information. Technical identifiers can become health data when linked to these records. We do not currently import data from HealthKit, wearables, healthcare providers, employers, or health-data brokers.',
        bullets: [
          'Physical condition and limitations: reported pain, injuries, limitations, and other health conditions you choose to describe.',
          'Fitness, activity, and recovery information: reported capacity, training history, goals connected to physical health, exercise records, effort, and any sleep or recovery details you choose to provide.',
          'Health-related communications: prompts, conversations, support messages, and notes that contain health information.',
          'Derived health information: AI summaries, capacity or training-need inferences, and personalized suggestions or plans that reveal or infer physical or mental health status.',
          'Linked identifiers: account identifiers and associated technical or diagnostic records where they identify you in connection with the health information above.',
        ],
      },
      {
        heading: 'Purposes and collection permissions',
        body: 'We use these categories to save the information you provide, answer training questions, personalize the fitness features you request, show your history, and address your support requests. Limited use for security, compliance, or legal claims occurs only as the relevant health-data law permits. We do not use health information for advertising, unrelated profiling, or general-purpose AI model training.\n\nWhere required, we obtain your informed, affirmative consent before collecting health data. If a law allows processing strictly necessary to provide a specific product or service you request without separate consent, we use that exception only within its limits. We do not assume that all analytics, tracing, search disclosures, or product development are necessary to your request.\n\nAccepting our Terms, viewing this notice, or using a preselected control is not consent. Additional categories or purposes requiring consent must be disclosed and approved before the new processing begins. Separate explicit consent may also be required under other applicable laws.',
      },
      {
        heading: 'Categories disclosed and recipients',
        body: 'Health information is disclosed only for the stated purpose, with required permission or another applicable legal basis. A search query or an embedding can remain health data even when a name is removed. The following recipients may process these categories:',
        bullets: [
          'Database and infrastructure providers: Supabase and Google Cloud process the submitted health records, conversations, generated results, and linked identifiers necessary to host, secure, and operate the app.',
          'AI inference provider: OpenAI processes health-related prompts, relevant history and account context, and generated results to support the feature requested.',
          'Research and search providers: Chroma Cloud receives query embeddings and associated search metadata; Tavily receives derived search text, potentially including health details; Cohere, where used, receives the query and research passages for relevance ranking.',
          'Workflow diagnostics: LangSmith, when enabled, can receive health-related inputs, outputs, and linked workflow information. Sentry, when enabled, receives errors and performance events, which could contain health-related information despite the integration’s collection restrictions.',
          'Support and confidential advisers: only the health information needed for an authorized support request or a legally permitted professional service. Authorities or other recipients receive health information only where a valid legal obligation or applicable exception permits or requires it.',
        ],
      },
      {
        heading: 'Affiliates, sale, and sharing controls',
        body: 'We do not currently share consumer health data with corporate affiliates. [CONFIRM BEFORE PUBLICATION: verify this statement and list each specific affiliate by legal name if any receives health data.]\n\nWe do not sell consumer health data or disclose it for targeted advertising. Where the law requires consent to sharing, we obtain it separately from collection consent and explain the categories, purpose, recipients, and withdrawal method. Processor disclosures must meet the applicable contract and instruction requirements; calling a company a service provider does not by itself create an exception. Any future sale would require the separate legal authorization and other conditions required by law; this notice does not authorize one.',
      },
      {
        heading: 'Access, withdrawal, and deletion rights',
        body: `Where the Act applies, you may ask whether we collect, share, or sell your consumer health data; request access; withdraw permission for collection or sharing; and request deletion. You may request a list of third parties and affiliates with which data was shared or sold and an active email address or other online means to contact them.

Send requests to ${contact} with “Health privacy request” and enough information to locate the relevant records. You do not need to create an account to make a request; an existing account may help us authenticate it. We will authenticate requests using reasonable means and will not ask for unnecessary health information. Authorized representatives may act where the law permits. We do not charge for ordinary requests except where the law allows a reasonable fee.

If you withdraw consent, we stop the processing that depends on it. Features that require that data may no longer work. Withdrawal does not automatically cancel Apple subscriptions; manage those through Apple. We will not punish you for exercising a privacy right.`,
      },
      {
        heading: 'Response periods and downstream deletion',
        body: 'We respond without undue delay and within 45 days after receiving a request. Where reasonably necessary and permitted, we may extend by another 45 days and explain the reason within the initial period. Authentication does not restart the response period. Deletion includes the applicable records across our systems, and we notify the processors, contractors, affiliates, and other recipients required by law to delete them. An allowed delay for archived or backup deletion cannot exceed six months after authentication of the request.\n\nAny exception must actually apply to the relevant data and purpose; we will explain a refusal where required. [CONFIRM BEFORE PUBLICATION: an operational deletion process covering every provider, linked trace, embedding, active record, and backup, with tested deadlines.]',
      },
      {
        heading: 'Appeals and complaints',
        body: `If we decline a request, reply to the decision or write to ${contact} with “Health privacy appeal.” Explain the decision you wish to challenge. We provide a written appeal result and reasons within 45 days after receiving the appeal and, if it is denied, tell you how to contact the Washington Attorney General. You may also contact the Attorney General directly without completing our appeal process.`,
        links: [{ label: 'Washington Attorney General — file a complaint', href: 'https://www.atg.wa.gov/file-complaint' }],
      },
      {
        heading: 'Changes to this health notice',
        body: 'We will update the effective date and provide appropriate notice of material changes. Before collecting, using, or sharing additional health-data categories or using them for a new purpose, we will provide the new disclosures and obtain fresh consent where required. A notice update alone does not authorize the new processing.',
      },
    ],
  },
  disclaimer: {
    ...draft,
    eyebrow: 'Safety',
    title: 'Fitness Disclaimer',
    summary: 'Arcel offers AI-assisted fitness information. Understanding its limits is part of deciding whether and how to use a suggestion.',
    sections: [
      {
        heading: 'Educational fitness information',
        body: 'Arcel supports general strength and conditioning education and training organization. It does not provide medical advice, diagnosis, treatment, rehabilitation, emergency services, or medical clearance. No clinician or human coach is implied to have reviewed an answer or plan. Research references do not make the app a medical service.',
      },
      {
        heading: 'Your circumstances matter',
        body: 'A recommendation may not account for your full medical history, current condition, medications, technique, equipment, or environment. An answer based on incomplete or inaccurate information may be unsuitable. A generated plan does not establish that an exercise is safe for you. Consult an appropriately qualified professional when you have an injury, medical condition, pregnancy, unexplained symptoms, or uncertainty about exercise safety, and follow professional restrictions.',
      },
      {
        heading: 'Exercise risks and urgent symptoms',
        body: 'Exercise carries risks, including falls, overexertion, and injury. Use suitable equipment, an appropriate environment, and instruction or supervision when needed. Do not follow an instruction that feels unsafe or contradicts professional advice.\n\nStop exercise if you experience concerning symptoms, such as chest pain, fainting, severe shortness of breath, or sudden severe pain, and seek appropriate medical help. Contact your local emergency services if you believe you have an emergency. Arcel does not continuously monitor your condition, read messages for emergencies, or summon help.',
      },
      {
        heading: 'AI and evidence can be wrong',
        body: 'Arcel generates information automatically. It can make up or misinterpret facts, calculations, references, or exercise instructions and can overlook contraindications. Scientific evidence changes, and findings from one population may not apply to another. Read original sources where important and obtain qualified guidance for decisions involving your health or safety.',
      },
      {
        heading: 'No promise of a result',
        body: 'Fitness, strength, endurance, recovery, and performance depend on many factors. Arcel does not guarantee improvement, a particular timeline, freedom from injury, or that the app will detect a problem. Preview screens and example programs are illustrations, not an individualized professional assessment.',
      },
      {
        heading: 'Report a concern and preserve your rights',
        body: `Report a misleading or potentially unsafe response to ${contact}, with enough context to locate it and without unnecessary sensitive details. Do not use that channel for emergencies.

This disclaimer explains the limits of the service; it does not exclude liability or waive rights that applicable law does not allow us to exclude. Read it with the Terms of Service. Effective date: ${effectiveDate}.`,
        links: [{ label: 'Terms of Service', href: '/terms' }],
      },
    ],
  },
  accessibility: {
    ...draft,
    eyebrow: 'Accessibility',
    title: 'Accessibility Statement',
    summary: 'We want people with different access needs to be able to understand Arcel’s information and use its features.',
    sections: [
      {
        heading: 'Scope and approach',
        body: 'This statement covers Arcel’s public website and mobile application. Our accessibility work aims to support readable content, keyboard and assistive-technology navigation, clear control names, sufficient contrast, and appropriate text scaling. WCAG 2.2 Level AA is a design and evaluation target for the website, with relevant native-platform accessibility guidance for the app.\n\nThis is an accessibility objective, not a claim that every page or feature currently conforms. Arcel is under development, and we have not completed a comprehensive independent accessibility audit. We will update this statement as testing identifies verified support and known barriers.',
        links: [{ label: 'Web Content Accessibility Guidelines 2.2', href: 'https://www.w3.org/TR/WCAG22/' }],
      },
      {
        heading: 'Known limitations and third-party content',
        body: 'The development app and AI-generated information may contain usability or accessibility barriers that have not yet been fully evaluated. Linked research papers, external websites, and system purchase or authentication interfaces may use different formats and controls. We cannot claim conformance for third-party content; tell us if it prevents you from accessing important information so we can consider an alternative.\n\n[CONFIRM BEFORE PUBLICATION: document actual keyboard, screen-reader, zoom, contrast, motion, and native text-scaling results and list any known unresolved barriers.]',
      },
      {
        heading: 'Request assistance or report a barrier',
        body: `Contact ${contact} with “Accessibility” in the subject. Describe the page or feature, what you were trying to do, and the barrier. If helpful, include your device, browser or app version, and assistive technology. Provide a preferred way to contact you. You do not need to disclose a diagnosis or prove a disability.

We will review the issue and discuss a reasonable accessible way to provide the relevant information or help. If you need these policies in another accessible format, include that request. [CONFIRM BEFORE PUBLICATION: monitored contact and a response process the team can meet.]`,
      },
      {
        heading: 'Review and contact',
        body: `Responsible operator: ${operator}, ${address}. We will revise this statement as the product and verified accessibility information change. Effective date: ${effectiveDate}. This statement does not limit any accessibility or consumer rights you have under applicable law.`,
      },
    ],
  },
}
