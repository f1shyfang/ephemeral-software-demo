# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

GitHub contributors who want a task-specific interface from a spoken request.

## Product Purpose

Ephemeral software: speak a request, generate a GitHub workspace live with Cerebras, refine it by speaking, and remember explicit UI preferences.

## Operating Context

Local browser demo with a public source repository. GitHub is the system of record. The repository contains illustrative sample issues and PRs labelled demo-data. The app is read-only and keeps API keys on the local server.

## Capabilities and Constraints

SpeechRecognition provides dictation where supported; typing is always available. Cerebras streams validated UI specifications for tables, lists, cards, and boards. Real GitHub records arrive independently. Preferences are explicit, visible, removable, and browser-local. A valid Cerebras key is required for live generation. No GitHub writes or synthetic inference results are presented as live output.

## Product Principles

- Make the prompt the starting point, and the generated workspace the main artifact.
- Preserve the user's context across spoken refinements.
- Keep preferences explicit and reversible.
- Show loading, empty and failure states clearly.

## Design Direction

User requested a Dia-inspired dashboard: quiet navigation, a spacious white canvas, prominent central prompt, and compact controls. Preserve all working voice, data, generation and memory behavior.

## Evidence on Hand

apps/ephemeral/README.md, schema.ts, generate.ts, github.ts and core.test.ts.
