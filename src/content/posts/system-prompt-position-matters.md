---
published: false
title: 'System Prompt Position Matters: Why Your Most Important Instruction Should Be First'
slug: 'system-prompt-position-matters'
description: 'How moving a single anti-hallucination rule from line 84 to line 2 of the system prompt changed behavior without changing a word of content — and the research that explains why.'
date: 2026-06-11
tags:
  - system prompts
  - LLM
  - prompt engineering
  - primacy bias
  - woss.io
featured: false
part_of_series: 'new-woss-io'
---

## The Problem: Line 84

The system prompt for [woss.io](/) had a "no invention" rule. It said:

> _No invention. Never mention company names, roles, or projects not found in context or tool results._

This was on **line 84** of the prompt — sandwiched between the identity statement ("You represent Daniel Maricic's professional portfolio...") and the style instructions ("Use markdown formatting..."). It read like a suggestion. The model fabricated data anyway.

## The Fix: Line 2

Commit `07016c5` on the `v1` branch did one thing: it moved the constraint to the **second paragraph**, right after the role definition:

> _CRITICAL — ANTI-HALLUCINATION RULE: Never fabricate, invent, or guess any data — including PR numbers, issue numbers, commit SHAs, dates, statistics, repository metadata, or any specific facts. If the exact data is not in context or tool results, say "I don't have that information." Do not extrapolate or construct plausible-looking but unverified data._

That's it. Zero words removed. Zero added to any other instruction. Just repositioned.

## How I Found This

I was staring at the prompt, trying to figure out why the model kept inventing commit SHAs. The "no invention" rule was there, plain text. The model was ignoring it. I started counting lines — line 84. That far into the prompt, buried between style rules and formatting examples. It wasn't that the model didn't understand the rule. It just didn't prioritize it.

So I checked the research. Multiple papers confirm that LLMs exhibit primacy bias — instructions at the start of a prompt carry more weight than those buried in the middle.

**Wang et al., EMNLP 2023** — the original paper establishing primacy bias in instruction-tuned LLMs. They showed that ChatGPT's classification decisions are sensitive to label order in prompts: earlier positions get selected more. If label position affects classification output, instruction position affects behavioral compliance.

**Cobbina & Zhou, EMNLP 2025** — a systematic study across 10 LLMs from 4 model families (Qwen, Llama3, Mistral, Cohere). They found placing demos at the start of the prompt yields the most stable outputs with gains up to +6 points. Placing demos at the end flips over 30% of predictions. The earliest positions have the highest influence — strongest for small models, but persistent across all sizes.

**ACL 2025 Findings** on serial position effects — confirmed primacy and recency biases across all tested LLMs. Content in the middle of a prompt is worst recalled. The "no invention" rule was in exactly this position: the serial position equivalent of an instruction void.

**Mao et al.** — a study on prompt position optimization showing that the positions used in many published works are often sub-optimal. No single position works universally, but early positions consistently outperform middle positions.

**ACM FAccT 2025** on system prompts as a mechanism of bias — showed that within-system position determines instruction weight. Same content, different position, different behavior. This isn't about user vs system prompt placement; it's about where things sit within the system prompt itself.

## What Changed

The original prompt structure put the identity statement at lines 1-2 (primacy zone, strong), then lines 3-83 were context sources and style rules (middle void, weak), then line 84 had the "no invention" rule (weakest position), then lines 85-94 had contact and refusal rules (recency zone, moderate).

The restructured prompt: identity at lines 1-2, then the anti-hallucination rule at line 3 — right in the primacy zone, immediately after the model understands its role, before any other instruction can dilute its weight. Everything else — context, style, GitHub, contact, refusal — comes after.

The anti-hallucination rule now sits in the strongest possible position.

### The Consolidation

The single-rule fix was followed by a full prompt consolidation (commit `43bcd29` on Jun 12). All system prompts — the base identity, the tool instructions, the refusal rules, the Macula and GitHub MCP instructions — were scattered across 7 files before the consolidation. After: one file, one review surface.

The consolidation didn't change the primacy insight. The anti-hallucination rule stayed at position 2. But it surfaced something else: new rules added to individual files (like "NO INFERRING FROM DIR NAMES" for Macula tools) were also in weak positions. They got promoted during the merge.

A second change introduced the "SHOW YOUR WORK" rule — requiring the model to include links and source references in its answers. This was placed right behind the anti-hallucination rule, in the same primacy zone. The position was intentional: if the model reads "never fabricate" first and then "always cite sources" second, those two rules reinforce each other structurally.

The persona also evolved. The original prompt opened with:

> You represent Daniel Maricic's professional portfolio...

The restructured prompt opens with:

> I am Haistlin — Daniel Maricic's digital presence...

The shift from "you represent" to "I am" is subtle but deliberate — the model adopts a consistent first-person identity rather than a detached representation. This change was placed in the primacy position as well, immediately above the anti-hallucination rule.

Net result: the system prompt grew from ~50 lines to ~130 lines, but the critical behavioral rules all sit in the primacy zone. The middle section handles tool-specific instructions and MCP configurations — information the model needs contextually, not behaviorally.

The weight distribution follows a predictable pattern: instructions in the primacy zone get disproportionate attention. The middle zone is where instructions go to be ignored. The recency zone works for boundary rules (refusal) because the model sees them right before generating — but it's unreliable for generative constraints like "don't fabricate data."

## What This Looks Like in Production

The full system prompt as it runs today:

```
I am Haistlin — Daniel Maricic's digital presence and professional
portfolio. Answer questions about his skills, experience, projects,
career history, and hobbies on his behalf.

CRITICAL — ANTI-HALLUCINATION RULE: Never fabricate, invent, or guess
any data — including PR numbers, issue numbers, commit SHAs, dates,
statistics, repository metadata, or any specific facts. If the exact
data is not in context or tool results, say "I don't have that
information." Do not extrapolate or construct plausible-looking but
unverified data.

Start with provided context. If context lacks the answer, use available
tools to find real data. No invention. Never mention company names,
roles, or projects not found in context or tool results.

SHOW YOUR WORK: Include links and references to your tool output so the
user can verify or explore further. When you retrieve data from a tool,
link to the source when possible.

[MCP tool rules, style instructions, GitHub link conventions...]

CRITICAL — REFUSAL RULE: If the user asks about anything NOT related
to Daniel Maricic, his professional work, his open-source projects
(DaliORM, Macula, woss.io), or his hobbies...
```

The original "no invention" text remains verbatim on line 4 — but it's now reinforced by the primary rule above it. The model reads the constraint first, then sees it echoed in the details. It's not redundant — it's layered reinforcement.

## What This Means

Before you optimize your prompt content, check your prompt architecture. Moving existing instructions into better positions costs nothing and can outperform adding new instructions.

Primacy bias applies to in-prompt instruction weight, not just classification. The same research that shows label order affects output predicts instruction order affects compliance.

The middle of a system prompt is where instructions go to be ignored. Put your most critical behavioral constraints in the first 3-5 lines. Everything else — style, formatting, examples — comes after.

This fix cost exactly zero tokens. No words added. No words removed. No tool definitions changed. The behavioral constraint already existed — it was just in the wrong place.

---

_Part of the [Building woss.io](/posts/building-woss-io) series. The prompt evolution is tracked in commits [07016c5](https://github.com/woss/woss.io/commit/07016c5) (position fix) and [43bcd29](https://github.com/woss/woss.io/commit/43bcd29) (consolidation)._
