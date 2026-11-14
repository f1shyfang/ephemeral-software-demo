---
name: Interface
description: A quiet, Dia-inspired workspace shaped by a spoken GitHub task.
colors:
  accent: "#27282e"
  primary-control: "#292b32"
  primary-hover: "#454852"
  ink: "#25262b"
  muted: "#666872"
  shell: "#f4f4f6"
  paper: "#fff"
  line: "#e5e5eb"
  canvas-border: "#e3e3e9"
  field-border: "#bcbec8"
  nav-selected: "#e7e7ec"
  hover: "#ededf1"
  focus: "#4966b6"
  composer-focus: "#a1aecb"
  connected: "#4e7e63"
  disconnected: "#9b7a40"
  open-state: "#367450"
  closed-state: "#76568f"
  error: "#a13f3b"
  listening: "#fce8e7"
  label-bg: "#f8f9fc"
  label-ink: "#5c6275"
  table-heading: "#f8f8fa"
  skeleton: "#eeeef3"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontSize: "24px"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  prompt:
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontSize: "11px"
rounded:
  label: "4px"
  navigation: "7px"
  control: "8px"
  card: "12px"
  canvas: "14px"
  composer-mobile: "16px"
  composer: "18px"
  circle: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "18px"
  lg: "24px"
  xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.primary-control}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  generate:
    backgroundColor: "{colors.primary-control}"
    textColor: "{colors.paper}"
    rounded: "{rounded.circle}"
    width: "32px"
    height: "32px"
    padding: "7px"
  input:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "10px"
  composer:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.composer}"
    padding: "17px 18px 12px"
  navigation-current:
    backgroundColor: "{colors.nav-selected}"
    rounded: "{rounded.navigation}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "18px"
  label:
    backgroundColor: "{colors.label-bg}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.label}"
    padding: "1px 5px"
---

# Design System: Interface

## Overview

**Creative North Star: “Your workspace, spoken.”**

The user-confirmed Dia Browser reference guides a quiet application shell: pale gray navigation surrounds an inset white canvas, with compact controls and native system typography. The initial prompt is the visual center. Once a workspace exists, GitHub records occupy the canvas and the same composer moves below them for refinement.

**Key Characteristics:**

- Spacious content area with a dense, low-emphasis sidebar.
- Near-black actions, fine separators, restrained semantic color.
- Inline SVG line icons and softly rounded application surfaces.
- Visible, reversible preferences and explicit loading, empty, and error states.

## Colors

The palette is cool and neutral; color communicates state rather than decoration. Frontmatter values describe the built stylesheet.

### Primary

- **Near-black:** `accent` supplies caret color; `primary-control` and `primary-hover` distinguish the submit action and connection save button.

### Neutral

- **Pale shell / white paper:** `shell` frames the `paper` canvas and composer.
- **Application ink / muted ink:** primary content uses `ink`; secondary instructions, metadata, and counts use `muted` and nearby gray variants from the stylesheet.
- **Fine lines:** `line` separates records and preference rows; `canvas-border` outlines the inset canvas; `field-border` gives standalone inputs a stronger edge.
- **Selected navigation:** `nav-selected` is a quiet filled row; hover remains a light neutral fill.

### Semantic states

- Green distinguishes connection readiness and open records; purple marks closed records. Amber marks a missing Cerebras connection.
- Red error text and the pale red listening fill carry separate failure and active microphone states. Keep text labels alongside these signals.
- Blue is reserved for keyboard focus and selection, not primary actions.

## Typography

**Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Use the operating system’s application face throughout; native monospace is limited to query code. No webfont dependency.

- **Initial headline:** 30px / 1.25, weight 500, tightened tracking; becomes 27px at 1050px and 24px at 700px.
- **Workspace title:** 24px / 1.3, weight 550; 22px on mobile. Supporting descriptions are 12px and at most 70ch wide.
- **Section heading:** 14px, weight 550–600. Record titles are 12px in tables or 13px / 1.5 in lists.
- **Body:** 14px / 1.5 root scale. Sidebar labels and controls generally use 10–12px; supporting footer/account text reaches 9px.
- **Prompt:** 15px / 1.6 initially, 13px after generation; 16px on mobile in both states.
- **Data:** descriptions are 11px and at most 65ch; metadata and table headers are 10px. Counts, metadata, and footer timing use tabular numerals.

## Layout

Desktop uses a `100dvh` grid: a 240px sidebar plus a flexible canvas, with an 8px inset above, right, and below the canvas. The sidebar and stage scroll independently. The canvas has a 56px context header and a flexible stage with 42px horizontal padding. The centered composer and its help row are capped at 720px. The greeting’s top margin is `clamp(35px, 11vh, 120px)`.

At 1500px and above, the sidebar becomes 250px and stage padding becomes 64px. At 1050px and below, the sidebar is 210px, stage padding is 26px, and workspace title/filter stack vertically. At 700px and below, the shell becomes a document-height column: controls become a compact top region, shortcuts form a horizontal row, account identity and the static current-page row hide, and conversation history shows only its latest message. Preferences and repository controls remain available. The canvas has rounded top corners and 18px stage gutters; connection fields stack.

Generated workspaces hide the greeting, place results first, and dock the composer beneath them. Above 700px the composer sticks 26px above the stage bottom with a sticky help strip beneath it. On mobile both return to normal flow. The prompt height changes from 78px to 46px after generation; mobile uses 95px initially and 65px after generation.

Tables and boards scroll within their own containers rather than widening the page. Board columns have a 230px minimum (220px on mobile); card grids auto-fill with a 240px target minimum bounded by available width. Standard table cells use 14px vertical padding, compact cells 9px. Lists use 16px vertical padding, compact lists 10px.

## Elevation & Depth

Depth comes mainly from the gray shell, white inset canvas, and fine borders. Data tables, lists, boards, and cards stay flat. The composer alone floats with `0 5px 26px #22233612, 0 1px 4px #2223360d`; focus changes it to `0 5px 26px #22233614, 0 0 0 2px #a1aecb`. Do not spread composer elevation to ordinary records.

## Shapes

Use rounded rectangles with a clear scale: 7px navigation, 8px controls, 12px cards, 14px canvas, and 18px composer (16px on mobile). Labels have modest 4px corners. The generate action and avatar are circles; status indicators are 6px dots. Borders are thin, mostly 1px. SVG icons use rounded caps and joins, generally 18px with a 1.6px stroke; compact contexts use 14–16px icons.

## Components

### Composer and actions

The white composer contains a borderless, vertically resizable textarea, repository context, a labelled Speak action, and a circular arrow submit button. Preserve its real form and textarea label. Keyboard submission uses Command/Ctrl+Enter. The outer focus-within ring replaces the textarea outline. Other interactive elements use a 2px `focus` outline with 4px offset. Buttons dim to 0.45 opacity when disabled. Hover uses neutral fills or the near-black primary hover; background/border transitions last 0.15s when motion is permitted.

### Navigation and preferences

The sidebar combines New workspace, prompt shortcuts, optional conversation, explicit preference rows, a repository disclosure, and account context. Shortcut buttons submit tasks. The current Workspace row has `aria-current="page"`; it is a static location indicator. Preferences show their values and individual Remove controls, plus Clear when nonempty. New workspace clears the current conversation and results while retaining preferences. Changing repository clears the previous workspace context.

### Generated records

Each section has a title, visible count, records, and an expandable GitHub query. Tables use real table semantics, hidden captions, and column headers. Lists/cards link each record as a whole; table title links underline on hover. GitHub links open in a new tab with `noopener noreferrer`. Labels wrap within 160px; descriptions and long record text wrap. Boards group into horizontal columns, defaulting to state when no grouping is requested. The search field filters visible records and is disabled during generation.

### Connections and status

Connections opens an inline, scrollable panel beneath the header, capped at 45dvh on desktop. It contains labelled password and model fields, a save action, GitHub connection context, and status text. Mobile removes the height cap and stacks fields. Main notices use a polite live status region; workspace loading sets `aria-busy` and a progress cursor. Generation disables conflicting controls and pulses the live dot at 1s; reduced-motion preference disables animation and transitions.

### Important states

- **Initial:** central question, composer, task suggestions, empty preferences, repository context, readiness text.
- **Streaming:** greeting disappears; composition text and neutral skeleton lines precede arriving sections and GitHub results. The composer remains below the growing workspace.
- **Ready:** generated title, description, filter, counts, queries, and end-to-end timing accompany the data.
- **Empty / partial failure:** an empty-state sentence or red section error replaces records; successful sections remain visible. A failed overall generation restores the previous workspace and announces the failure.
- **Dictation:** Speak changes to Stop, sets `aria-pressed`, and gains the listening fill. Transcription appears in the textarea; a final utterance submits when recognition ends. Denied/error/empty recognition does not submit. Unsupported browsers disable the mic and retain typing guidance.
- **Missing connection / unavailable storage:** expose the connection panel and key field when generation needs credentials; explain when preferences can persist only for the current tab.

## Do's and Don'ts

- **Do** keep the prompt prominent initially and give generated records the main canvas after submission.
- **Do** retain quiet, compact application controls, visible focus, semantic markup, and textual status alongside color.
- **Do** keep memory explicit and removable, and distinguish live data from test replay. Review screenshots in `.impeccable/review/` cover initial and generated desktop/mobile layouts plus a board; browser verification replays previously verified live traces and labels that replay in the footer. Simulated speech was verified; a physical microphone was not tested.
- **Don't** introduce decorative gradients, large colored navigation surfaces, or webfont-led editorial typography into this confirmed neutral application direction.
- **Don't** hide empty, incomplete, failed, or disconnected states behind invented records or success claims.
- **Don't** replace the responsive document flow on mobile with the desktop sticky composer behavior.

### Hosted connections

On Sites, Connections shows the shared provider status and an optional public GitHub username. Visitors never see or change the host’s API key. The repository selector is read-only in the hosted sample demo. Browser-local preferences and the voice/text composer retain the same behavior; limit and connection failures use the existing inline status area.
