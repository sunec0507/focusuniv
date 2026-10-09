# Group data sync

This matches the current implementation. It is not a roadmap.

## Personal vs team

| Data | Store | API |
| --- | --- | --- |
| Personal tasks, events, timetables, GPA, sessions, personal pages | `user_states.payload` | `PUT /api/data` |
| Team tasks | `group_tasks` | `GET/POST /api/groups` |
| Team pages, docs, PDF metadata/annotations | `group_pages` | `upsert-page`, `delete-page` |
| Meeting polls and confirmations | `meeting_polls` | `create-poll`, `confirm-poll`, `unconfirm-poll` |

The client never treats a caller-supplied `userId` or `groupId` as authorization. Every group action checks the Identity user and server membership. Confirm/cancel also checks `groups.createdBy`.

## Pages

One `group_pages` row per page. `payload` holds tabs, blocks, PDF name/size/page/notes/annotations. `revision` is incremented on each save. A stale `revision` returns `409` with the latest page. The client does not auto-merge.

PDF binaries stay on the uploader's device (`pdfUri` data URL, 8MB cap). They are stripped before insert. Other members see metadata and annotations, with copy that the file itself is not shared. There is no object-storage backend yet.

## Confirmed meetings

Confirm writes `status`, `confirmedDate`, `confirmedStart`, `confirmedEnd`, `confirmedBy`, `confirmedAt` on the poll row. The calendar renders a synthetic event `gevent-{pollId}`. Re-confirm updates the same poll; it does not create a second event. Cancel sets `status=cancelled` and hides the event.

## Account deletion

Last member: polls, pages, tasks, and the group row are deleted. Other members: the user is removed from `member_ids` only. Personal backups export personal pages/tasks/events and group membership names, not shared page bodies or team tasks.
