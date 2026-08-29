# DESIGN.md

Focusuniv is a student operate surface: cool gray paper, a rail sidebar, hairline lists, and one blue. The product is a desk for one running clock, not a dashboard of metric cards.

## Surface

Light operate UI for university planning. Sidebar rail on desktop, bottom tabs on small screens. Type is Pretendard; clocks use IBM Plex Mono. Radius is 8px. Accent `#2563EB` is for primary actions, the running ring, completion fill, and selected day — not decoration.

## Color

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f6f7f9` | Canvas |
| `--rail` | `#eceef2` | Sidebar, tracks |
| `--paper` | `#ffffff` | Lists, editor, calendar |
| `--ink` | `#111827` | Text, focus desk bar |
| `--muted` | `#5b6472` | Meta |
| `--line` | `#e5e7eb` | Hairlines |
| `--accent` | `#2563eb` | Action, progress, ring |
| `--accent-soft` | `#eff4ff` | Play, callout |
| `--danger` | `#dc2626` | Destructive |
| `--ok` | `#16a34a` | Exercise category |

Category colors stay on the dots only: school `#0EA5E9`, work `#6366F1`, personal `#2563EB`, exercise `#16A34A`.

## Type

- Pretendard for UI. Page titles 32px / 28px mobile, weight 700, tracking about -0.045em.
- Body 15–16px. Meta 12–13px.
- Tabular numbers on clocks and percents. IBM Plex Mono on the live clock.

## Components

- Hairline task rows: checkbox, title, duration, play.
- Completion track: 8px rail with accent fill (`scaleX`).
- Circular timer: 10px SVG ring, clock in the hole.
- Timeline: 48px hour rows, minute columns as thin vertical rules, sessions as short color blocks.
- Focus desk: ink bar, pill tabs for 오늘 할 일 / 타이머 / 그룹 / 프로젝트 / 캘린더, timer keeps running.
- Projects: Notion-like tree + slash blocks (heading, list, todo, toggle, quote, divider, code, table, callout, child page).
- AI coach: unread bell + toast on day rollover.

## Motion

One moment: the completion fill eases in with `cubic-bezier(0.16, 1, 0.3, 1)`. The ring stroke updates on the clock tick. No entrance choreography on every section.

## Responsive

860px collapses the rail to a five-item bottom nav. Project tree stacks above the editor. Task duration hides; play stays.
