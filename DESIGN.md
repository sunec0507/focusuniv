# DESIGN.md

Focusuniv is a student operate surface: cool gray paper, a rail sidebar, hairline lists, and one blue. The product is a desk for one running clock, not a dashboard of metric cards.

## Surface

Light operate UI for university planning. Sidebar rail on desktop, bottom tabs on small screens. Type is Pretendard; clocks use IBM Plex Mono. Radius is 8px. Accent `#2563EB` is for primary actions and the running ring. Selected chips and progress fills use `--accent-soft` or a mixed rail tone.

## Color

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f6f7f9` | Canvas |
| `--rail` | `#eceef2` | Sidebar, tracks |
| `--paper` | `#ffffff` | Lists, editor, calendar |
| `--ink` | `#111827` | Text, focus desk bar |
| `--muted` | `#5b6472` | Meta |
| `--line` | `#e5e7eb` | Hairlines |
| `--accent` | `#2563eb` | Primary action, running ring |
| `--accent-soft` | `#eff4ff` | Selection, play, callout |
| `--danger` | `#dc2626` | Destructive |
| `--ok` | `#16a34a` | Exercise category |

Category colors stay on the dots only: school `#0EA5E9`, work `#6366F1`, personal `#2563EB`, exercise `#16A34A`.

## Type

- Pretendard for UI. Page titles 32px / 28px mobile, weight 700, tracking about -0.045em.
- Body 15–16px. Meta 12–13px.
- Tabular numbers on clocks and percents. IBM Plex Mono on the live clock.

## Components

- Hairline task rows: checkbox, title, duration, play. First-time focus uses a `집중 시작` label beside play; after any session exists, icon only.
- Completion track: 8px rail with accent fill (`scaleX`). Calendar cells show the track, not a percent numeral.
- Circular timer: 10px SVG ring, clock in the hole. The measured task title stays visible while running.
- Timeline (공부 기록): 48px hour rows, minute columns as thin vertical rules, sessions as short color blocks.
- Focus desk: ink bar, pill tabs for 오늘 할 일 / 타이머 / 팀플 / 내 자료 / 캘린더, timer keeps running.
- 내 자료 / 팀플 자료: Notion-like tree + slash blocks. Primary toolbar is bold, list, checklist, link, file. Advanced formatting stays in 더보기. PDF tools appear only on PDF pages.
- Team share banner: “팀플 멤버에게 공유되는 자료입니다” plus save state.
- Meeting poll: count `가능 n/전체` in each cell. Selected cells use an ink inset border; recommended cells use a dashed outline and a 추천 label. Color intensity is secondary.
- Calendar: time events as filled chips, due tasks as dashed chips, team events with a 팀플 badge, overflow as `+N`.
- AI coach: unread bell + toast on day rollover. Work alerts and product update notes are listed separately.

## Motion

One moment: the completion fill eases in with `cubic-bezier(0.16, 1, 0.3, 1)`. The ring stroke updates on the clock tick. No entrance choreography on every section. Honor `prefers-reduced-motion`.

## Responsive

860px collapses the rail to a four-item bottom nav plus More. A floating 빠른 추가 button sits above the nav and does not add a fifth tab. Desktop search lives in the sidebar; mobile search stays in the top bar. Project tree stacks above the editor. Task duration hides; play stays. Today/timetable split stacks from 1080px so the timetable is not crushed.
