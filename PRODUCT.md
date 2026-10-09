# Focusuniv

대학생이 시간표, 할 일, 집중 시간, 팀플 업무와 자료를 한곳에서 다루는 한국어 워크스페이스.

## Product truth

- Audience: university students planning a day across classes, group work, and personal study.
- Mechanism: one task owns the clock; everything else is context around that running measurement.
- Data: Netlify Identity account required. Personal data lives in `/api/data`. Team data (tasks, shared pages, polls) lives in `/api/groups` and is scoped by server-side membership.
- AI: optional coach. On day rollover it turns yesterday's completion and session shape into a notification. Task split is secondary.

## Core loop

오늘 할 일 → 집중 시작 → 공부 기록 → 캘린더/시간표 → 팀플 업무와 약속.

보조 기능: 내 자료 편집, PDF 열람, GPA, 데이터 내보내기, 테마, 시간표 붙여넣기 입력(한 줄에 한 과목, 미리보기 후 저장).

배포 목표: 팀플 약속 잡기 링크가 새 사용자를 데려오는 통로. Firebase 전환 후 링크로 들어온 사람은 로그인 없이(익명 로그인) 투표하고, 원하면 가입으로 이어진다.

## Shared team data

- Group tasks sync to `group_tasks`. `전체` 담당은 멤버별 완료 상태를 유지하되 `assignmentGroupId`로 묶어 목록에는 한 줄로 보인다.
- 팀플은 두 가지에 집중한다: **약속 잡기**(시간표 기반 빈 시간 찾기 → 투표 → 확정 → 캘린더)와 **업무 나누기**(담당·마감 → 각자 오늘 할 일).
- 팀플 자료는 **링크**로 모은다 (Notion·Google Docs·드라이브). 링크는 `group_pages`에 `type: "link"`, `payload: { url, note }`로 저장되고 클라이언트에서는 팀플 "링크" 탭에만 보인다.
- 2026-09-28 이전에 만든 팀플 문서/PDF(`group_pages`의 page/folder/pdf)는 삭제하지 않고 링크 탭 아래 "이전 팀플 자료 (보관)"로 열 수 있다. 새로 만들지는 않는다.
- Meeting polls can be confirmed by the group creator. Confirmed times appear on members' calendars as `gevent-{pollId}` and are not stored in personal event backups.
- After leaving a group, tasks and pages from that group are removed from the client and blocked by the API.

## Persistence

- Personal todos, events, timetables, GPA, sessions, and personal pages go through `/api/data`.
- Group pages, group tasks, and confirmed poll events are stripped from the personal remote payload and from personal backups.
- Account deletion removes the user's personal state. Shared team data is deleted only when the user is the last member.

## Voice

Korean UI. Short, specific, no cheerleading. Controls name the action.

User-facing terms: 팀플 (not 그룹), 공부 기록 (not 타임라인), 이번 주 마감, 공부 기록 종료. Personal workspace title is 내 자료; team workspace title is 팀플 자료.

## Constraints

- Static HTML/CSS/JS client. Netlify Functions + Identity + Database + AI Gateway.
- Visual world is canon operate: Todoist, Apple Reminders, Linear. Cool gray `#f6f7f9`, rail `#eceef2`, accent `#2563EB`, Pretendard, 8px radius, hairline lists.
- No emoji as chrome icons. New accounts start empty; categories and one blank timetable are the only defaults.
- No step-by-step onboarding. Empty states may include one short static hint.
