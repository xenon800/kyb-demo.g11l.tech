# Process Log: OTC Onboarding Prototype

How this prototype was built, step by step, including the open questions and the decisions that changed along the way. This is a working log, not a polished write-up.

Built by Gerrit Schnell as a technical assessment for Lunar Rails. Mock data only.

---

## 1. The brief (23 Oct 2026)

Get a corporate OTC client trading-ready in 24 hours instead of up to 3 weeks. Two mock clients:

- **Client A:** Canadian company, simple ownership, normal volumes.
- **Client B:** UAE company held through an offshore holding, one PEP director, high volumes.

My first read: the two clients are a deliberate contrast. Client A is the case that should go through fast. Client B tests whether I know when *not* to automate. A good result is A trading within hours and B routed into enhanced due diligence, not B forced through in 24 hours.

## 2. First thoughts on the rules (my raw notes)

Before writing any rules, I listed what actually drives risk in KYB onboarding from my experience reviewing B2B onboardings at Relai:

- Not all corporate clients are equal. Some are simple (single UBO, low risk, normal volumes, clean company documents). Others are complex: holding structures, and depending on the jurisdiction they need different documents.
- **Which documents are required is a Compliance decision, not mine.** My job is to translate that policy into system logic.
- Complex cases can be pre-processed automatically, but a human always signs off.
- PEPs: many firms don't onboard them at all. *(Open question, see below.)*
- High volumes need proper checks of bank statements and tax declarations.
- Up to an agreed volume, smaller companies could be onboarded automatically, with EDD only above a threshold. *(To be agreed with Compliance.)*
- With multiple UBOs, documentation must be complete for all of them. *(Open question: all UBOs or only above an ownership threshold?)*
- Some jurisdictions can't be onboarded at all. *(Check whether Lunar Rails publishes excluded jurisdictions.)*

## 3. Open questions to resolve

- [ ] PEP: reject by default, or escalate to EDD with senior approval?
- [ ] UBO threshold: which owners must be fully verified?
- [ ] Volume thresholds: where does automatic approval stop?
- [ ] Excluded jurisdictions: is there a published Lunar Rails list?
- [ ] Client A: fully automatic approval, or a light human check before trading?
