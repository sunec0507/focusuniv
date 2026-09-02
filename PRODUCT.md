# Focus

Student focus workspace for university work: dated todos, one live clock per task, minute-grid timeline, nested project pages, and a next-day efficiency note.

## Product truth

- Audience: university students planning a day across classes, group work, and personal projects.
- Mechanism: one task owns the clock; everything else is context around that running measurement.
- Data: Netlify Identity account required. Device storage holds the working copy and syncs to the signed-in account. The app is not usable without signing in.
- AI: optional coach. On day rollover it turns yesterday's completion and session shape into a notification. Task split is secondary.

## Voice

Korean UI. Short, specific, no cheerleading. Controls name the action.

## Constraints

- Static HTML/CSS/JS client. Netlify Functions + Identity + Database + AI Gateway.
- Visual world is canon operate: Todoist, Apple Reminders, Linear. Cool gray `#f6f7f9`, rail `#eceef2`, accent `#2563EB`, Pretendard, 8px radius, hairline lists.
- No emoji as chrome icons. New accounts start empty; categories and one blank timetable are the only defaults.
