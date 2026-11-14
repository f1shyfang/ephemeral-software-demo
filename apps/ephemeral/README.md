# Ephemeral GitHub workspace

A local, read-only GitHub demo. Dictate a task, watch Cerebras stream a layout, refine it by speaking, and retain explicit UI preferences across workspaces and browser reloads.

```sh
npm ci
npm run ephemeral
```

Open [the local demo](http://127.0.0.1:4321). Use Chrome for browser dictation and allow microphone access. Typed requests work in other browsers. Speech recognition may use the browser vendor's remote transcription service; Cerebras generates the layout from the transcript.

## Connect

GitHub uses `GITHUB_TOKEN` or the current `gh auth token` in server memory. Without authentication it can search public repositories; personal assignments and review requests require an authenticated account. Run `gh auth login` before starting. Credentials never reach generated layouts or browser JavaScript.

Add your **Cerebras** key in Connections. This saves it only in server memory, and the next generation validates provider access. Alternatively set `CEREBRAS_API_KEY` and `CEREBRAS_MODEL` in the shell or ignored `.env.local` before starting. The default model is `qwen-3.8-27b`; select an account-accessible model supporting streaming and strict JSON Schema output. This app uses Cerebras directly; it does not fall back to another provider.

Configuration:

- `EPHEMERAL_PORT`: loopback port, default `4321`.
- `EPHEMERAL_REPOSITORY`: initial repository, default `f1shyfang/ephemeral-software-demo`. Change it in the UI at any time. For a repository with abundant public data, try `microsoft/vscode`.
- `EPHEMERAL_GENERATION_LIMIT`: cumulative maximum provider attempts for this demo, default `100`. The durable counter is `artifacts/ephemeral/allowance.json`, reserved before each call. Restarting does not reset it. Each attempt requests at most 3,000 completion tokens; failed or unknown attempts still consume an allowance. This is a request limit, not a dollar budget.

The server binds to `127.0.0.1`, validates Host and Origin, rejects cross-site calls, and keeps secrets server-side. Do not expose this local credential-bearing demo through a public tunnel.

## Dashboard

The Dia Browser-inspired shell has a quiet sidebar, central voice/text prompt and white workspace. Generated views take over the canvas; the same composer stays available below the results for refinements. The sidebar contains working task shortcuts, explicit preferences, and an expandable repository selector. Cmd/Ctrl + K starts a new workspace.

## Three-minute demo

1. Select a repository. Say **“Show me open pull requests as a table with assignees, labels, and last updated.”** Pause to submit the utterance automatically. You can also type and click Generate view or press Cmd/Ctrl + Enter.
2. Say **“Make it a board grouped by assignee.”** The data query stays intact while the interface changes.
3. Say **“I prefer compact tables without descriptions. Remember that.”** A visible preference list updates.
4. Click **New workspace** and say **“Show me open issues labelled bug.”** The new workspace inherits your saved preferences.
5. Reload to show that preferences persist. Remove an individual preference or click Clear all to forget them.

For personal data, try **“Show PRs waiting for my review”** or **“Show open bugs assigned to me.”** A repository may have no matching records; empty results are real and explicitly shown.

## How generation works

The browser sends the transcript, recent conversation, current validated layout, selected repository, and saved preferences. The server reads available GitHub labels and calls Cerebras with a strict UI-plan schema. As complete section objects arrive, it validates them, streams them to the browser, and fetches matching GitHub records. The browser progressively renders sections and replaces their loading state with actual records. This generates a composition from reusable components, rather than executing model-written JavaScript.

Layouts include tables, lists, cards, and boards; sections support density, descriptions, columns and grouping. Queries support issues/PRs, open/closed state, labels, assignment, requested reviews, literal search text and sorting. Each section fetches at most the first 100 matches, with counts and truncation shown. Search filters act on the visible records. Opening a record goes to GitHub; the demo makes no GitHub writes. The UI shows actual browser-measured time from request submission to a completed workspace, including model generation, GitHub requests and rendering. Speech transcription time is excluded.

Temporary refinements do not update memory. Explicit remember/prefer/default/always/save/forget requests may update preferences. Preferences and the last repository are stored in this browser's local storage. Conversation, generated workspaces, API keys and GitHub records are not persisted by the browser. The current layout remains visible if the next generation fails. A section-specific GitHub failure is displayed inside that section, while other sections remain usable.

## Verification

```sh
npm run typecheck
npm run test:ephemeral
npm test
```

Core tests cover arbitrary SSE boundaries, incremental JSON section parsing, invalid/truncated provider responses, schema validation, GitHub query normalization and temporary preference isolation. Unit provider responses are mocked. A live Cerebras/GitHub verification on 14 November 2026 exercised issue generation, explicit preference memory, temporary board refinement and a fresh PR workspace inheriting saved defaults. Four HTTP requests completed in approximately 1.7–1.9 seconds each; these are observations, not a latency guarantee or measurements of speech transcription.

The redesigned browser flow was checked at desktop, mobile and the actual in-app browser viewport. Automated browser checks replayed those actual provider/API traces to verify rendering, sidebar shortcuts, simulated dictation, preference persistence, filtering and error recovery without additional paid calls. Physical microphone input remains an interactive check. Local evidence is in `artifacts/ephemeral/live-verification.json` and `artifacts/ephemeral/dia-browser-check.json`; these files are ignored by Git.

Provider references: [Cerebras structured outputs](https://inference-docs.cerebras.ai/capabilities/structured-outputs), [streaming](https://inference-docs.cerebras.ai/capabilities/streaming), [GitHub search](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests), [browser speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
