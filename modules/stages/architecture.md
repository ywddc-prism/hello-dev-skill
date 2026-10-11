# Stage 4: Architecture - One Decision at a Time

> Execution boundaries follow [SKILL.md](../../SKILL.md) and [State Protocol](../core/state-protocol.md). Below is on-demand teaching and check material; not required to execute all examples, create irrelevant deliverables, or repeat already-confirmed questions.

## Teaching Goal

This stage is about **making architectural decisions together, one at a time**.

Instead of presenting all decisions at once, we'll discuss each decision separately:
- You answer one question
- I record the answer
- Based on your answer, we move to the next question
- After all questions, I generate the architecture document

**By the end of this stage, you will:**
- Understand the reasoning behind each architectural choice
- Have a clear architecture document based on your answers
- Be able to explain why we made each choice

---

## How This Works

```markdown

 THE CONVERSATION FLOW 

 STEP 1: I ask ONE question 
 "Question 1: ..." 

 STEP 2: You answer 
 Your answer: [your response] 

 STEP 3: I record and confirm 
 "Got it. I've noted that [summary]. 
 Next question..." 

 STEP 4: Repeat until done 

 STEP 5: Generate document 
 "Based on all your answers, here's our architecture" 

```

---

## Current Status

```

 ARCHITECTURE DECISIONS - IN PROGRESS 

 [ ] Decision 1: Frontend/Backend Split 
 [ ] Decision 2: Frontend Framework 
 [ ] Decision 3: Data Storage 
 [ ] Decision 4: State Management 
 [ ] Decision 5: Component Structure 
 [ ] Decision 6: API Design 

 Progress: 0 / 6 completed 

```

---

## Decision 1: Frontend/Backend Split

### The Question

```markdown
## Question 1 of 6: Do you need multiple frontends?

**Scenario A: "Yes"**
> You need a website, a mobile app, AND maybe a desktop app - all sharing the same data.

**Scenario B: "No"**
> Just one website, no plans for mobile or desktop.

**Scenario C: "Not sure"**
> Maybe someday, but not now.

---

**Your answer**: [A / B / C]

Or in your own words: [Tell me about your situation]
```

---

## After Your Answer

Once you respond, I will:

1. **Record your answer**
2. **Explain why this matters**
3. **Show what this means for the next question**
4. **Ask the next question**

---

## Our Discussion So Far

```markdown
## Discussion Log

| # | Question | Your Answer | Recorded |
|---|----------|-------------|----------|
| 1 | Frontend/Backend Split | [pending] | [ ] |
| 2 | Frontend Framework | [pending] | [ ] |
| 3 | Data Storage | [pending] | [ ] |
| 4 | State Management | [pending] | [ ] |
| 5 | Component Structure | [pending] | [ ] |
| 6 | API Design | [pending] | [ ] |

---

### Detailed Notes

**Decision 1: Frontend/Backend Split**
- Your answer: [will be filled in]
- What this means: [will be explained based on your answer]
- Reasoning: [your explanation]
```

---

## Ready?

**Let's start with Question 1.**

Just tell me your situation regarding frontend/backend split:
- Do you need both website AND mobile app?
- Or just a website for now?
- Or something else?

Your answer doesn't have to be technical - just describe what you're thinking about building.

---

## Stage Deliverables

| Deliverable | Template | Description |
|--------|------|------|
| Architecture design document | [architecture-template.md](../../references/architecture-template.md) | Standard structure for architecture docs; quality must not be lower than this template |
| Interface design | [api-design-template.md](../../templates/api-design-template.md) | Interface contract, error codes, examples |
| Rollback plan | [rollback-plan-template.md](../../templates/rollback-plan-template.md) | Required for high-risk changes |
