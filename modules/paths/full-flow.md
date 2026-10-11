# Full Flow

> Use design/full when new design or important architecture decisions are needed.

```text
Bootstrap -> Initialization -> Requirement -> Tool Research -> Feature Design -> Architecture -> Prototype -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive
```

Each stage explicitly starts/completes. Design stages submit by module; approval attached with real evidence; annotations are not approval. For design-only tasks, implementation stage organizes final documentation; does not auto-generate code.

implementation/full with confirmed approach does not require going through design stages again, but retains the other stages. The Prototype stage replaces the former sequential UX Design + UI Design pair with a single interleaved iteration loop: UX and UI decisions are addressed together in each round, each round produces a runnable HTML prototype, the user experiences and provides feedback, and the next round incorporates that feedback. After convergence, specification documents are extracted from the working prototype. Learn/Evolution/Reflection/Archive are mandatory post-delivery stages.

## On-Demand Templates

- Requirements: [prd-template.md](../../references/prd-template.md)
- Feature design: [feature-design-template.md](../../templates/feature-design-template.md)
- Architecture: [architecture-template.md](../../references/architecture-template.md)
- Prototype (interleaved UX+UI): [prototype.md](../stages/prototype.md)
- UX specification (extracted from prototype): [ux-research-template.md](../../templates/ux-research-template.md)
- UI specification (extracted from prototype): [ui-design-template.md](../../templates/ui-design-template.md)
- Design system (extracted from prototype): [design-system-template.md](../../templates/design-system-template.md)
- Interface: [api-design-template.md](../../templates/api-design-template.md)
- Testing: [test-report-template.md](../../templates/test-report-template.md)
- Review: [review-checklist-template.md](../../templates/review-checklist-template.md)

Templates only used when deliverables need them; do not treat example data as project facts, and do not expand scope to fill templates. Overall contract in [SKILL.md](../../SKILL.md); state semantics in [state-protocol.md](../core/state-protocol.md).
