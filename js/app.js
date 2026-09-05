import { icon } from "./icons.js";
import {
  addDays,
  clock,
  escapeHtml,
  formatDateKey,
  parseDateKey,
  formatDuration,
  formatHoursMinutes,
  formatKoreanDate,
  formatMonthDay,
  formatShortKoreanDate,
  makeCalendarDays,
  splitIntoHourBars,
  uid,
} from "./util.js";
import * as store from "./store.js";
import * as auth from "./auth.js";

const NOTE_STYLES = [
  { type: "heading", label: "제목", klass: "sty-title" },
  { type: "subheading", label: "제목 2", klass: "sty-head" },
  { type: "paragraph", label: "본문", klass: "sty-body" },
  { type: "code", label: "모노", klass: "sty-mono" },
];
const NOTE_PARA_STYLES = [
  { type: "paragraph", label: "일반 텍스트" },
  { type: "heading", label: "제목" },
  { type: "subheading", label: "제목 2" },
  { type: "code", label: "모노" },
  { type: "quote", label: "인용" },
  { type: "callout", label: "콜아웃" },
];
const NOTE_FONTS = [
  { id: "Pretendard", css: 'Pretendard, "Pretendard Variable", sans-serif' },
  { id: "Arial", css: "Arial, Helvetica, sans-serif" },
  { id: "Georgia", css: "Georgia, serif" },
  { id: "Times New Roman", css: '"Times New Roman", Times, serif' },
  { id: "Courier New", css: '"Courier New", Courier, monospace' },
  { id: "맑은 고딕", css: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif' },
];
const NOTE_LINE_HEIGHTS = [1, 1.15, 1.5, 2];
const NOTE_SIZES = [13, 15, 17, 20, 24, 28, 34];
const NOTE_COLORS = ["#111827", "#2563EB", "#DC2626", "#16A34A", "#0EA5E9", "#7C3AED", "#EA580C", "#CA8A04"];
const NOTE_HIGHLIGHTS = [
  { label: "없음", color: "transparent" },
  { label: "노랑", color: "#FEF08A" },
  { label: "초록", color: "#BBF7D0" },
  { label: "분홍", color: "#FBCFE8" },
  { label: "파랑", color: "#BFDBFE" },
  { label: "주황", color: "#FED7AA" },
];
const NOTE_EMOJIS = [
  "😀", "😅", "😂", "🥰", "😍", "🤔", "😎", "🤩",
  "😭", "😡", "👍", "👎", "👏", "🙏", "🔥", "✨",
  "💯", "🎉", "❤️", "💙", "✅", "❌", "⭐", "📌",
  "📝", "💡", "📚", "⏰", "📅", "🎯", "🚀", "☕",
  "🌸", "🍀", "🌈", "☀️", "🌙", "💪", "👀", "🤝",
];
const NOTE_FILE_MAX = 8 * 1024 * 1024;
const NOTE_HISTORY_MAX = 50;
const PDFJS_URL = "https://esm.sh/pdfjs-dist@6.2.108";
const PDFJS_WORKER = "https://esm.sh/pdfjs-dist@6.2.108/es2022/build/pdf.worker.min.mjs";

let pdfJsLib = null;
let pdfJsLoad = null;
let pdfDocCache = { pageId: null, doc: null, numPages: 0 };
let pdfMainTask = null;
let pdfMountGen = 0;
let pdfPaintGen = 0;
let pdfLastFitWidth = 0;
let pdfResizeObs = null;
let pdfInkDrag = null;
let pdfWheelOff = null;
let pdfWheelAcc = 0;
let pdfWheelIdle = 0;
let pdfWheelArmed = true;

const ui = {
  date: new Date(),
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  timeline: new Date(),
  slash: null,
  panel: false,
  modal: null,
  authMode: "signup",
  authReady: false,
  accountReady: false,
  authNotice: "",
  deletingAccount: false,
  onboarding: false,
  toast: null,
  auxMinutes: "30",
  addingCategory: null,
  nightEnter: false,
  toolsOpen: false,
  tool: null,
  stopwatch: { running: false, accumulated: 0, startedAt: null },
  calc: { display: "0", left: null, op: null, fresh: true },
  selectedBlockId: null,
  formatOpen: false,
  listOpen: false,
  colorOpen: false,
  highlightOpen: false,
  emojiOpen: false,
  pastePlain: false,
  findOpen: false,
  findQ: "",
  replaceQ: "",
  findIndex: 0,
  commentBlockId: null,
  commentDraft: "",
  noteHistory: { pageId: null, tabId: null, past: [], future: [] },
  docTabMenu: null,
  renamingTabId: null,
  docTabsCollapsed: false,
  newPageParent: "",
  newPageGroupId: "",
  pdfZoom: 1,
  pdfInk: { mode: "off", color: "#111827", width: 3.5 },
  pdfNotesOpen: false,
  noteQuery: "",
  notePageId: null,
  courseId: null,
  courseSlotsDraft: null,
  courseColorDraft: "",
  courseFormDraft: null,
  courseDeleteConfirm: false,
  eventId: null,
  timetableTab: "grid",
  timetableId: "",
  timetableMenu: false,
  gpaSemester: "",
  gpaTarget: "4.0",
  gpaRemain: "9",
  groupTab: "tasks",
  availLoading: false,
  availResult: null,
  availGroupId: null,
  pollGroupId: null,
  pollEditId: null,
  pollMenu: null,
  pollDrafts: {},
  pollHover: null,
  settingsTab: "account",
  permCamera: "",
  permNotify: "",
  editCategoryId: null,
  editingTaskId: null,
  openTaskMenu: null,
  navMore: false,
  noteMoreOpen: false,
  searchQuery: "",
  searchHits: [],
};

let lastRouteName = "";
const CUSTOM_FONT_NAME = "custom-user-font";
const CUSTOM_FONT_MAX = 2 * 1024 * 1024;
let customFontReady = "";

let remoteProfiles = [];
let remotePolls = [];
let profilesReady = false;
let profilesRequest = null;
let bundleGen = 0;
const deletedPollIds = new Set();
const groupMemberSnapshot = new Map();
const pollSaveSeq = {};

const GROUP_TABS = ["tasks", "projects", "schedule"];

function parseHash() {
  const hash = location.hash.replace(/^#/, "") || "/today";
  const [path] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "today";
  return { name, id: parts[1] || "", extra: parts[2] || "", pageId: parts[3] || "" };
}

function go(path) {
  location.hash = path.startsWith("#") ? path : `#${path}`;
}

function inheritedGroupId(page) {
  let cursor = page;
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.groupId) return cursor.groupId;
    cursor = cursor.parentId ? store.projectById(cursor.parentId) : null;
  }
  return undefined;
}

function groupPath(groupId, tab = "tasks", pageId = "") {
  if (!groupId) return "/groups";
  if (tab === "projects" && pageId) return `/groups/${groupId}/projects/${pageId}`;
  if (tab === "projects") return `/groups/${groupId}/projects`;
  if (tab === "schedule") return `/groups/${groupId}/schedule`;
  return `/groups/${groupId}`;
}

function groupRoute(hash = parseHash()) {
  if (hash.name !== "groups" || !hash.id) return null;
  const tab = GROUP_TABS.includes(hash.extra) ? hash.extra : "tasks";
  return {
    groupId: hash.id,
    tab,
    pageId: tab === "projects" ? hash.pageId : "",
  };
}

function todayKey() {
  return formatDateKey(new Date());
}

function dateKeyFrom(date) {
  return formatDateKey(date);
}

function navItems() {
  return [
    { href: "#/today", name: "today", label: "오늘 할 일", ic: "list", primary: true },
    { href: "#/calendar", name: "calendar", label: "캘린더", ic: "calendar", primary: true },
    { href: "#/timetable", name: "timetable", label: "시간표", ic: "timetable", primary: true },
    { href: "#/projects", name: "projects", label: "프로젝트", ic: "folder", primary: true },
    { href: "#/timeline", name: "timeline", label: "타임라인", ic: "clock", primary: false },
    { href: "#/groups", name: "groups", label: "그룹", ic: "users", primary: false },
  ];
}

function primaryNavItems() {
  return navItems().filter((item) => item.primary);
}

function moreNavItems() {
  return [
    ...navItems().filter((item) => !item.primary),
    { href: "#/profile", name: "profile", label: "프로필", ic: "user" },
    { href: "#/settings", name: "settings", label: "설정", ic: "sliders" },
  ];
}

function side(active) {
  const me = auth.user();
  return `
    <aside class="side">
      <a class="brand" href="#/today">
        <div class="brand-mark">${icon("sparkle", 16)}</div>
        <div>
          <div class="brand-name">Focusuniv</div>
          <div class="brand-sub">대학생 집중 워크스페이스</div>
        </div>
      </a>
      <nav class="nav">
        ${navItems()
          .map(
            (item) =>
              `<a class="${active === item.name || (active === "focus" && item.name === "today") ? "active" : ""}" href="${item.href}">${icon(item.ic, 16)} ${item.label}</a>`,
          )
          .join("")}
      </nav>
      <div class="side-foot">
        <button type="button" class="side-foot-link" data-act="open-search">${icon("search", 16)} 검색</button>
        <a class="side-foot-link ${active === "profile" ? "active" : ""}" href="#/profile">${icon("user", 16)} 프로필</a>
        <a class="side-foot-link ${active === "settings" ? "active" : ""}" href="#/settings">${icon("sliders", 16)} 설정</a>
        <div class="account">
          <span>${escapeHtml(me?.email || me?.user_metadata?.name || "계정")}</span>
          <button class="ghost" data-act="auth">로그아웃</button>
        </div>
      </div>
    </aside>`;
}

function bell() {
  const count = store.unreadCount();
  const notes = store.getState().notifications.slice(0, 8);
  return `
    <div class="bell-wrap">
      <button class="icon-btn" data-act="bell" aria-label="알림">${icon("bell")}
        ${count ? `<span class="badge">${count}</span>` : ""}
      </button>
      ${
        ui.panel
          ? `<div class="panel">
            ${
              notes.length
                ? notes
                    .map(
                      (note) =>
                        `<button class="note" data-act="go-notification" data-id="${note.id}" data-group="${escapeHtml(note.groupId || "")}" data-task="${escapeHtml(note.taskId || "")}" data-poll="${escapeHtml(note.pollId || "")}">
                          <b>${escapeHtml(note.title)}</b>
                          <div class="task-meta">${escapeHtml(note.body)}</div>
                        </button>`,
                    )
                    .join("")
                : `<div class="empty">아직 알림이 없습니다.</div>`
            }
          </div>`
          : ""
      }
    </div>`;
}

function top(title, sub, extra = "", opts = {}) {
  const titleHtml = opts.titleAct
    ? `<h1 class="page-title page-title-act" data-act="${opts.titleAct}" role="button" tabindex="0">${escapeHtml(title)}</h1>`
    : `<h1 class="page-title">${escapeHtml(title)}</h1>`;
  return `
    <div class="topbar">
      <div>
        ${titleHtml}
        ${sub ? `<p class="page-date">${sub}</p>` : ""}
      </div>
      <div class="row-actions"><button type="button" class="icon-btn" data-act="open-search" aria-label="검색">${icon("search")}</button>${extra}${bell()}</div>
    </div>`;
}

function progressBlock(dateKey, label) {
  const { done, total, percent } = store.progressOn(dateKey);
  return `
    <section class="progress" aria-label="${escapeHtml(label)}">
      <div class="progress-head">
        <span class="progress-label">${escapeHtml(label)}</span>
        <span class="progress-value">${percent}% · ${done}/${total || 0}</span>
      </div>
      <div class="track"><div class="fill" style="transform:scaleX(${percent / 100})"></div></div>
    </section>`;
}

function personalFocusCard() {
  const streak = store.focusStreak();
  const week = store.weeklyFocusSummary();
  const today = todayKey();
  const peak = Math.max(1, ...week.days.map((day) => day.seconds));
  const weekLabel = week.totalSeconds ? `이번 주 ${formatHoursMinutes(week.totalSeconds)}` : "이번 주 없음";
  return `
    <section class="progress focus-week" aria-label="개인 집중 기록. 그룹에는 보이지 않습니다.">
      <div class="progress-head">
        <span class="progress-label">내 집중 기록</span>
        <span class="progress-value">${streak}일 연속 · ${weekLabel}</span>
      </div>
      <div class="focus-week-bars" role="img" aria-label="이번 주 요일별 집중 시간">
        ${week.days
          .map((day) => {
            const ratio = day.seconds / peak;
            const title = `${day.label} · ${formatHoursMinutes(day.seconds)}`;
            return `<div class="focus-week-col${day.date === today ? " today" : ""}${day.seconds ? "" : " empty"}">
              <div class="track focus-week-track" title="${escapeHtml(title)}">
                <div class="fill" style="transform:scaleY(${ratio.toFixed(3)})"></div>
              </div>
              <span>${day.label}</span>
            </div>`;
          })
          .join("")}
      </div>
    </section>`;
}

function dueLabel(dueDate) {
  if (!dueDate) return "";
  const today = todayKey();
  if (dueDate === today) return "D-day";
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${dueDate}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (Number.isNaN(days)) return "";
  if (days < 0) return `D+${-days}`;
  return `D-${days}`;
}

function selfDisplayName() {
  const nick = String(store.getState().profile?.nickname || "").trim();
  if (nick) return nick;
  const me = auth.user();
  return me?.email || me?.user_metadata?.full_name || me?.user_metadata?.name || "나";
}

function assigneeChoices(group) {
  const self = selfDisplayName();
  if (!auth.user() || !remoteProfiles.length) return [`나(${self})`];
  const names = [];
  const seen = new Set();
  const add = (value) => {
    const label = String(value || "").trim();
    if (!label || seen.has(label)) return;
    seen.add(label);
    names.push(label);
  };
  for (const memberId of group.memberIds || []) {
    const profile = remoteProfiles.find((item) => item.userId === memberId);
    if (profile?.nickname) add(profile.nickname);
    else if (memberId === auth.user()?.id) add(self);
  }
  if (!names.length) add(self);
  else add(self);
  if ((group.memberIds || []).length >= 2) names.unshift("전체");
  return names;
}

function upsertRemotePoll(poll) {
  if (!poll?.id || deletedPollIds.has(poll.id)) return;
  const idx = remotePolls.findIndex((item) => item.id === poll.id);
  remotePolls =
    idx >= 0
      ? remotePolls.map((item) => (item.id === poll.id ? { ...item, ...poll } : item))
      : [poll, ...remotePolls];
}

function applyIncomingPolls(incoming) {
  const list = (Array.isArray(incoming) ? incoming : []).filter((item) => item?.id && !deletedPollIds.has(item.id));
  const ids = new Set(list.map((item) => item.id));
  const pending = remotePolls.filter(
    (item) => item.pendingCreate && item.id && !ids.has(item.id) && !deletedPollIds.has(item.id),
  );
  remotePolls = [...pending, ...list];
}

function ensureRemoteProfiles() {
  if (!auth.user() || profilesReady || profilesRequest) return;
  const gen = bundleGen;
  profilesRequest = auth
    .fetchGroupBundle()
    .then((data) => {
      if (gen !== bundleGen) return;
      if (data) applyGroupBundle(data);
    })
    .catch(() => {
      if (gen !== bundleGen) return;
      remoteProfiles = [];
      remotePolls = remotePolls.filter((item) => item.pendingCreate);
    })
    .finally(() => {
      if (gen !== bundleGen) return;
      profilesReady = true;
      profilesRequest = null;
      render();
    });
}

function requireLoginForGroups() {
  if (auth.user()) return true;
  ui.modal = "auth";
  ui.toast = { title: "로그인이 필요해요", body: "그룹 기능은 로그인 후 이용할 수 있어요" };
  return false;
}

function refreshGroupBundle() {
  bundleGen += 1;
  profilesReady = false;
  profilesRequest = null;
  ensureRemoteProfiles();
}

function maybeRefreshGroupBundle() {
  if (!auth.user() || !ui.accountReady) return;
  if (document.visibilityState === "hidden") return;
  if (profilesRequest) return;
  refreshGroupBundle();
}

function applyGroupBundle(data) {
  remoteProfiles = Array.isArray(data?.profiles) ? data.profiles : [];
  applyIncomingPolls(data?.polls);
  store.applyRemoteGroupTasks(data?.tasks);
  const uid = auth.user()?.id;
  const incoming = Array.isArray(data?.groups) ? data.groups : [];
  store.setGroups(uid ? incoming.filter((group) => (group.memberIds || []).includes(uid)) : []);
  syncGroupActivityAlerts();
}

async function hydrateAccount() {
  const user = auth.user();
  ui.accountReady = false;
  if (!user) {
    store.bindAccount(null);
    return;
  }
  store.bindAccount(user.id);
  store.setPersistEnabled(false);
  try {
    const remote = await auth.pullRemote().catch(() => null);
    if (remote?.payload) store.replaceState(remote.payload);
    store.setCurrentMemberId(user.id);
    const data = await auth.fetchGroupBundle().catch(() => null);
    if (data) {
      bundleGen += 1;
      profilesReady = true;
      profilesRequest = null;
      applyGroupBundle(data);
    } else {
      store.setGroups((store.getState().groups || []).filter((group) => (group.memberIds || []).includes(user.id)));
      syncGroupActivityAlerts();
    }
  } finally {
    store.setPersistEnabled(true);
    store.flushPersist();
    ui.accountReady = true;
  }
}

function syncGroupJoinAlerts(groups) {
  const uid = auth.user()?.id;
  for (const group of groups || []) {
    const ids = (group.memberIds || []).map((item) => String(item));
    const prev = groupMemberSnapshot.get(group.id);
    groupMemberSnapshot.set(group.id, ids);
    if (!prev) continue;
    const names = ids
      .filter((id) => !prev.includes(id) && id !== uid)
      .map((id) => memberLabel(id));
    if (!names.length) continue;
    store.pushNotification({
      type: "group-join",
      title: "새 멤버가 들어왔어요",
      body: `${names.join(", ")} 님이 ${group.name || "그룹"}에 참여했습니다.`,
      groupId: group.id,
    });
  }
}

function assigneeNameIsMe(name) {
  const raw = String(name || "").trim();
  if (!raw) return false;
  const mine = myAssigneeNames();
  if (mine.has(raw)) return true;
  const wrapped = raw.match(/^나\((.+)\)$/);
  return Boolean(wrapped && mine.has(wrapped[1].trim()));
}

function noteAssignedTasksToMe() {
  const mine = (store.getState().tasks || []).filter(
    (task) => task.groupId && task.status !== "completed" && assigneeNameIsMe(task.assigneeName),
  );
  const fresh = new Set(store.takeNewAssignedTaskIds(mine.map((task) => task.id)));
  if (!fresh.size) return;
  const groups = store.getState().groups || [];
  for (const task of mine) {
    if (!fresh.has(task.id)) continue;
    const group = groups.find((item) => item.id === task.groupId);
    store.pushNotification({
      type: "task-assign",
      title: "할 일이 배정됐어요",
      body: `${group?.name ? `${group.name} · ` : ""}${task.title}`,
      groupId: task.groupId,
      taskId: task.id,
    });
  }
}

function noteNewGroupTasks() {
  const uid = auth.user()?.id;
  const tasks = (store.getState().tasks || []).filter((task) => task.groupId);
  const fresh = new Set(store.takeNewGroupTaskIds(tasks.map((task) => task.id)));
  if (!fresh.size) return;
  const groups = store.getState().groups || [];
  for (const task of tasks) {
    if (!fresh.has(task.id)) continue;
    if (!task.createdBy || task.createdBy === uid) continue;
    const group = groups.find((item) => item.id === task.groupId);
    const author = task.createdByName || memberLabel(task.createdBy);
    const assignee = task.assigneeName || "미정";
    store.pushNotification({
      type: "task-add",
      title: "새 할 일이 추가됐어요",
      body: `${author} 님이 ${group?.name || "그룹"}에 "${task.title}" (담당: ${assignee})을 추가했습니다`,
      groupId: task.groupId,
      taskId: task.id,
    });
  }
}

function maybeNotifyPollDeadlines() {
  const today = todayKey();
  const limit = formatDateKey(addDays(new Date(), 1));
  const uid = auth.user()?.id;
  for (const poll of remotePolls) {
    const dates = Array.isArray(poll.dates) ? [...poll.dates].sort() : [];
    const end = dates[dates.length - 1] || "";
    if (!end || end < today || end > limit) continue;
    const mine = pollResponsesFor(poll).find((row) => row.userId === uid);
    if (mine && (mine.slots || []).length) continue;
    store.pushNotification({
      type: "poll-due",
      title: "약속 잡기 마감이 가까워요",
      body: `${poll.title || "약속 잡기"} · ${end}까지 가능 시간을 표시해 주세요.`,
      groupId: poll.groupId,
      pollId: poll.id,
    });
  }
}

function syncGroupActivityAlerts() {
  syncGroupJoinAlerts(store.getState().groups);
  noteAssignedTasksToMe();
  noteNewGroupTasks();
  maybeNotifyPollDeadlines();
}

function maybeSyncTimetable({ empty = false, refresh = false } = {}) {
  if (!auth.user()) return;
  const on = Boolean(store.getState().settings?.shareTimetableWithGroups);
  if (!on && !empty) return;
  auth
    .syncTimetable(on ? store.primaryCourses() : [])
    .then(() => {
      if (refresh) refreshGroupBundle();
    })
    .catch(() => {});
}

function minutesToClock(total) {
  const hours = Math.floor(Math.max(0, Number(total) || 0) / 60);
  const minutes = Math.max(0, Number(total) || 0) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function eventColorValue(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || "")) ? String(value) : "#2563eb";
}

function clockFromMeridiem(hour12, minutes, isPm) {
  let hour = Number(hour12);
  if (!Number.isFinite(hour)) hour = 12;
  hour = Math.min(12, Math.max(1, Math.round(hour)));
  let mins = Number(minutes);
  if (!Number.isFinite(mins)) mins = 0;
  mins = Math.min(59, Math.max(0, Math.round(mins)));
  const hours24 = (hour % 12) + (isPm ? 12 : 0);
  return minutesToClock(hours24 * 60 + mins);
}

function clockParts(value, fallback = "09:00") {
  const total = timeToMinutes(value || fallback);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const isPm = hours >= 12;
  return { hour12: hours % 12 || 12, minutes, isPm };
}

function timeField(name, value, label) {
  const parts = clockParts(value);
  const clock = clockFromMeridiem(parts.hour12, parts.minutes, parts.isPm);
  const prefix = label || name;
  return `
    <label class="time-field-wrap">
      ${label ? `<span class="time-field-label">${escapeHtml(label)}</span>` : ""}
      <div class="time-field" data-time-field>
        <input type="hidden" name="${escapeHtml(name)}" value="${clock}">
        <input class="field time-num" data-act="time-hour" type="number" inputmode="numeric" min="1" max="12" value="${parts.hour12}" aria-label="${escapeHtml(prefix)} 시">
        <span class="time-colon" aria-hidden="true">:</span>
        <input class="field time-num" data-act="time-minute" type="number" inputmode="numeric" min="0" max="59" value="${String(parts.minutes).padStart(2, "0")}" aria-label="${escapeHtml(prefix)} 분">
        <button type="button" class="time-ampm${parts.isPm ? " pm" : ""}" data-act="toggle-ampm" aria-pressed="${parts.isPm ? "true" : "false"}">${parts.isPm ? "오후" : "오전"}</button>
      </div>
    </label>`;
}

function syncTimeField(field) {
  if (!field) return "";
  const hourEl = field.querySelector("[data-act='time-hour']");
  const minuteEl = field.querySelector("[data-act='time-minute']");
  const ampmEl = field.querySelector("[data-act='toggle-ampm']");
  const hidden = field.querySelector('input[type="hidden"]');
  const clock = clockFromMeridiem(hourEl?.value, minuteEl?.value, ampmEl?.getAttribute("aria-pressed") === "true");
  if (hidden) hidden.value = clock;
  return clock;
}

function toggleAmPm(button) {
  const next = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", next ? "true" : "false");
  button.classList.toggle("pm", next);
  button.textContent = next ? "오후" : "오전";
  syncTimeField(button.closest("[data-time-field]"));
}

function polishTimeField(el) {
  const field = el.closest("[data-time-field]");
  if (!field) return;
  const hourEl = field.querySelector("[data-act='time-hour']");
  const minuteEl = field.querySelector("[data-act='time-minute']");
  const clock = syncTimeField(field);
  const parts = clockParts(clock);
  if (hourEl) hourEl.value = String(parts.hour12);
  if (minuteEl) minuteEl.value = String(parts.minutes).padStart(2, "0");
}

function eventFormFields(event) {
  return `
    <input class="field" name="title" placeholder="일정 제목" value="${escapeHtml(event?.title || "")}" required>
    <input class="field" name="date" type="date" value="${escapeHtml(event?.date || dateKeyFrom(ui.date))}" required>
    <div class="event-times">
      ${timeField("startTime", event?.startTime || "09:00", "시작")}
      ${timeField("endTime", event?.endTime || "10:00", "종료")}
    </div>
    <label class="event-color-row">색상
      <input class="field cat-color" name="color" type="color" value="${escapeHtml(eventColorValue(event?.color))}">
    </label>`;
}

function halfHourKeys(startTime, endTime) {
  const keys = [];
  let cursor = timeToMinutes(startTime);
  const last = timeToMinutes(endTime);
  while (cursor < last) {
    keys.push(minutesToClock(cursor));
    cursor += 30;
  }
  return keys;
}

function datesBetween(from, to) {
  if (!from || !to) return [];
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const keys = [];
  for (let date = new Date(start); date <= end && keys.length < 14; date = addDays(date, 1)) {
    keys.push(formatDateKey(date));
  }
  return keys;
}

function memberLabel(userId) {
  const profile = remoteProfiles.find((item) => item.userId === userId);
  if (profile?.nickname) return profile.nickname;
  if (userId === auth.user()?.id) return selfDisplayName();
  return "멤버";
}

function isBusyShared(profile) {
  return Array.isArray(profile?.busySlots) && profile.busySlots.length > 0;
}

function pollResponsesFor(poll) {
  const uid = auth.user()?.id;
  const rows = Array.isArray(poll.responses) ? poll.responses.map((row) => ({ ...row, slots: [...(row.slots || [])] })) : [];
  if (uid && ui.pollDrafts[poll.id]) {
    const mine = rows.find((row) => row.userId === uid);
    if (mine) mine.slots = [...ui.pollDrafts[poll.id]];
    else rows.push({ userId: uid, slots: [...ui.pollDrafts[poll.id]] });
  }
  return rows;
}

function pollDateLabel(key) {
  try {
    return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(parseDateKey(key));
  } catch {
    return key;
  }
}

function compareTaskPriority(a, b) {
  const rank = { high: 0, normal: 1, low: 2 };
  const diff = (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
  if (diff) return diff;
  if (a.status === "completed" && b.status !== "completed") return 1;
  if (b.status === "completed" && a.status !== "completed") return -1;
  return 0;
}

function taskRow(task, opts = {}) {
  const running = store.getState().activeTimer?.taskId === task.id;
  const group = task.groupId ? store.getState().groups.find((item) => item.id === task.groupId) : null;
  const due = task.dueDate ? dueLabel(task.dueDate) : "";
  const metaParts = [task.assigneeName, task.note].filter(Boolean);
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const subDone = subs.filter((item) => item.done).length;
  const prio = task.priority === "high" || task.priority === "low" ? task.priority : "";
  const prioLabel = prio === "high" ? "높음" : prio === "low" ? "낮음" : "";
  return `
    <div class="task ${task.status === "completed" ? "done" : ""}">
      <button class="check" data-act="toggle-task" data-id="${task.id}" aria-label="완료">${task.status === "completed" ? icon("check", 12) : ""}</button>
      <div>
        <div class="task-title">${prio ? `<span class="prio-dot ${prio}" title="${prioLabel}"></span>` : ""}${escapeHtml(task.title)}${prio === "high" ? `<span class="prio-label">높음</span>` : ""}${group ? `<span class="team-badge">${escapeHtml(group.name)}</span>` : ""}${due ? `<span class="due-chip">${due}</span>` : ""}${subs.length ? `<span class="sub-chip">${subDone}/${subs.length} 완료</span>` : ""}</div>
        <div class="task-meta">${metaParts.map(escapeHtml).join(" · ")}</div>
      </div>
      <span class="dur">${formatHoursMinutes(task.focusedSeconds)}</span>
      ${
        opts.hideActions
          ? ""
          : `<div class="task-menu-wrap">
              <button class="icon-btn" data-act="task-menu" data-id="${task.id}" aria-label="할 일 메뉴" aria-expanded="${ui.openTaskMenu === task.id ? "true" : "false"}">${icon("moreVertical", 14)}</button>
              ${
                ui.openTaskMenu === task.id
                  ? `<div class="task-menu-pop">
                      <button type="button" data-act="edit-task" data-id="${task.id}">수정</button>
                      <button type="button" class="danger-text" data-act="del-task" data-id="${task.id}">삭제</button>
                    </div>`
                  : ""
              }
            </div>`
      }
      ${
        opts.hidePlay
          ? ""
          : `<button class="play" data-act="play-task" data-id="${task.id}" aria-label="시간 측정">${running ? icon("pause", 14) : icon("play", 14)}</button>`
      }
    </div>`;
}

function categoryAdd(dateKey, categoryId) {
  if (ui.addingCategory === categoryId) {
    return `
      <form class="inline-add" data-act="add-task">
        <input class="field" name="title" data-add-title placeholder="할 일" required>
        <input class="field" name="note" placeholder="메모 (선택)">
        <input type="hidden" name="date" value="${dateKey}">
        <input type="hidden" name="categoryId" value="${categoryId}">
        <div class="row-actions">
          <button class="ghost" type="button" data-act="cancel-add">취소</button>
          <button class="primary" type="submit">추가</button>
        </div>
      </form>`;
  }
  return `<button class="add-row" data-act="start-add" data-cat="${categoryId}">${icon("plus", 16)} 새로운 할 일 추가</button>`;
}

function dateNav(which) {
  const current = which === "timeline" ? ui.timeline : ui.date;
  const label = formatDateKey(current) === todayKey() ? "오늘" : formatMonthDay(current);
  return `
    <div class="date-nav">
      <button class="icon-btn" data-act="date-prev" data-which="${which}">${icon("chevronLeft")}</button>
      <button class="date-chip" data-act="date-today" data-which="${which}">${escapeHtml(label)}</button>
      <button class="icon-btn" data-act="date-next" data-which="${which}">${icon("chevronRight")}</button>
    </div>`;
}

function myAssigneeNames() {
  const names = new Set();
  const add = (value) => {
    const label = String(value || "").trim();
    if (label) names.add(label);
  };
  const self = selfDisplayName();
  add(self);
  add("나");
  add(`나(${self})`);
  const me = auth.user();
  add(me?.email);
  add(me?.user_metadata?.full_name);
  add(me?.user_metadata?.name);
  add(store.getState().profile?.nickname);
  return names;
}

function upcomingDeadlineStrip() {
  const items = store.upcomingDeadlines(7);
  if (!items.length) return "";
  const groups = store.getState().groups || [];
  return `
    <div class="deadline-strip">
      <span class="tt-switch-label">다가오는 마감</span>
      <div class="tt-chip-row">
        ${items
          .map((task) => {
            const group = task.groupId ? groups.find((item) => item.id === task.groupId) : null;
            const label = dueLabel(task.dueDate) || "D-day";
            const overdue = Boolean(task.dueDate && task.dueDate < todayKey());
            return `<button type="button" class="tt-chip deadline-chip ${overdue ? "overdue" : ""}" data-act="go-deadline" data-group="${escapeHtml(task.groupId || "")}" data-id="${task.id}">
              <span class="tt-chip-mark">${escapeHtml(label)}</span>
              <span class="deadline-title">${escapeHtml(task.title)}</span>
              ${group ? `<span class="deadline-group">${escapeHtml(group.name)}</span>` : ""}
            </button>`;
          })
          .join("")}
      </div>
    </div>`;
}

function viewToday(embedded = false) {
  const key = dateKeyFrom(ui.date);
  const strip = upcomingDeadlineStrip();
  const tasks = store.tasksOn(key);
  const groups = store.getState().categories.map((cat) => ({
    cat,
    tasks: tasks.filter((task) => task.categoryId === cat.id),
  }));
  const list = groups
    .map(
      (group) => `
          <div class="group-title"><span class="dot" style="background:${group.cat.color}"></span>${escapeHtml(group.cat.name)}</div>
          <div class="list">
            ${group.tasks.map((task) => taskRow(task)).join("")}
            ${categoryAdd(key, group.cat.id)}
          </div>`,
    )
    .join("");
  if (embedded) {
    return `${strip}<div class="embed-nav">${dateNav("today")}</div>${list}`;
  }
  const extra = `<button class="ghost" data-act="go-categories">${icon("settings", 14)} 카테고리 관리</button>${dateNav("today")}`;
  return `
    ${top("오늘 할 일", formatShortKoreanDate(ui.date), extra)}
    ${strip}
    <div class="today-split">
      <div class="today-split-list">${list}</div>
      ${viewTodaySchedule()}
    </div>`;
}

function ringSvg(progress) {
  const r = 88;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, progress)));
  return `
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="${r}" fill="none" stroke="#eceef2" stroke-width="10"/>
      <circle data-ring-arc cx="100" cy="100" r="${r}" fill="none" stroke="var(--accent)" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
    </svg>`;
}

function timerProgress() {
  const aux = store.getState().auxiliaryTimer;
  const now = Date.now();
  if (aux) {
    const remain = store.remainingNow(now);
    return aux.durationSeconds ? remain / aux.durationSeconds : 0;
  }
  const elapsed = store.elapsedNow(now);
  return (elapsed % 3600) / 3600;
}

function auxPanel(aux, remain) {
  return `
    <div class="aux-card">
      <div class="progress-head">
        <span class="progress-label">보조 타이머 ${aux ? (aux.isRunning ? "진행" : "일시정지") : ""}</span>
        <span class="progress-value" data-clock="aux">${aux ? clock(remain) : "00:00:00"}</span>
      </div>
      <div class="presets">
        ${[10, 20, 30, 50]
          .map(
            (min) =>
              `<button class="preset ${Number(ui.auxMinutes) === min ? "on" : ""}" data-act="aux-min" data-min="${min}">${min}분</button>`,
          )
          .join("")}
        <input class="field aux-min" data-act="aux-custom" value="${escapeHtml(ui.auxMinutes)}" inputmode="numeric">
        ${
          aux
            ? `<button class="ghost" data-act="${aux.isRunning ? "aux-pause" : "aux-resume"}">${aux.isRunning ? "정지" : "재개"}</button>
               <button class="danger" data-act="aux-stop">해제</button>`
            : `<button class="primary" data-act="aux-start">시작</button>`
        }
      </div>
    </div>`;
}

function viewTimer(embedded = false) {
  const s = store.getState();
  const task = s.tasks.find((item) => item.id === s.activeTimer?.taskId);
  const elapsed = store.elapsedNow();
  const remain = store.remainingNow();
  const aux = s.auxiliaryTimer;
  const progress = timerProgress();
  const face = aux ? clock(remain) : clock(elapsed);
  const cat = store.categoryById(task?.categoryId);
  if (task && (embedded || s.activeTimer)) {
    return `
      <div class="night-stage">
        <div class="night-badge"><span class="dot" style="background:${cat?.color || "#2563eb"}"></span>${escapeHtml(cat?.name || "")}</div>
        <h2 class="night-title">${escapeHtml(task.title)}</h2>
        <div class="ring-wrap">
          <div class="ring">
            ${ringSvg(progress)}
            <div class="ring-face">
              <div>
                <div class="ring-time night-clock" data-clock="main">${face}</div>
                <div class="ring-sub">집중 중</div>
              </div>
            </div>
          </div>
        </div>
        <div class="night-controls">
          <button class="night-pause" data-act="${s.activeTimer.isRunning ? "pause" : "resume"}" aria-label="${s.activeTimer.isRunning ? "일시정지" : "재개"}">${s.activeTimer.isRunning ? icon("pause", 26) : icon("play", 26)}</button>
          <button class="night-stop" data-act="finish">${icon("stop", 18)} 측정 종료</button>
        </div>
        ${auxPanel(aux, remain)}
      </div>`;
  }
  return `
    ${embedded ? "" : top("타이머", "할 일을 고른 뒤 원형 타이머가 채워집니다")}
    <div class="ring-wrap">
      <div class="ring">
        ${ringSvg(progress)}
        <div class="ring-face">
          <div>
            <div class="ring-time" data-clock="main">${face}</div>
            <div class="ring-sub">오늘 할 일에서 재생을 눌러 측정하세요</div>
          </div>
        </div>
      </div>
    </div>
    <div class="empty">오늘 할 일에서 재생을 누르면 집중 화면으로 이동합니다.</div>`;
}

function viewTimeline() {
  const key = dateKeyFrom(ui.timeline);
  const s = store.getState();
  const sessions = s.sessions.filter((session) => session.date === key).sort((a, b) => a.startTime - b.startTime);
  const total = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const dayTasks = store.tasksOn(key);
  const groups = s.categories
    .map((cat) => {
      const catTasks = dayTasks.filter((task) => task.categoryId === cat.id);
      const seconds = sessions
        .filter((session) => session.categoryId === cat.id)
        .reduce((sum, session) => sum + session.durationSeconds, 0);
      return { cat, tasks: catTasks, seconds };
    })
    .filter((group) => group.tasks.length > 0 || group.seconds > 0);
  const hours = Array.from({ length: 25 }, (_, hour) => hour);
  return `
    ${top("타임라인", formatShortKoreanDate(ui.timeline), dateNav("timeline"))}
    <div class="tl-head">
      <span>분 단위 집중 기록</span>
      <b>${formatDuration(total)}</b>
    </div>
    <div class="tl-board">
      <div class="tl-tasks">
        ${
          groups.length
            ? groups
                .map((group) => {
                  const rows = group.tasks.length
                    ? group.tasks
                        .map((task) => {
                          const seconds = sessions
                            .filter((session) => session.taskId === task.id)
                            .reduce((sum, session) => sum + session.durationSeconds, 0);
                          return `<div class="tl-record">
                            <span class="tl-bar" style="background:${group.cat.color}"></span>
                            <div>
                              <div class="task-title">${escapeHtml(task.title)}</div>
                              <div class="task-meta">${seconds > 0 ? "측정 완료" : "미측정"}</div>
                            </div>
                            <span class="dur">${formatDuration(seconds)}</span>
                          </div>`;
                        })
                        .join("")
                    : `<div class="task-meta" style="padding:10px 12px">삭제된 할 일의 측정 기록</div>`;
                  return `<section class="tl-group">
                    <div class="tl-group-head">
                      <span class="dot" style="background:${group.cat.color}"></span>
                      <b>${escapeHtml(group.cat.name)}</b>
                      <span>총 ${formatHoursMinutes(group.seconds)}</span>
                    </div>
                    ${rows}
                  </section>`;
                })
                .join("")
            : `<div class="empty"><b>아직 할 일이 없습니다</b><p>오늘 할 일에 할 일을 추가하면 여기에 기록이 쌓입니다.</p></div>`
        }
        <div class="task-meta" style="padding:12px 4px">전체 할 일 ${dayTasks.length}개</div>
      </div>
      <div class="tl-grid" aria-label="시간 격자">
        ${hours
          .map(
            (hour) =>
              `<div class="tl-hour" style="top:${hour * 34}px"><span>${String(hour).padStart(2, "0")}</span><i></i></div>`,
          )
          .join("")}
        <div class="tl-plot">
          ${[1, 2, 3, 4, 5].map((n) => `<span class="tl-min" style="left:${(n / 6) * 100}%"></span>`).join("")}
          ${sessions
            .flatMap((session) => {
              const cat = store.categoryById(session.categoryId);
              return splitIntoHourBars(session.startTime, session.durationSeconds).map(
                (part) =>
                  `<button class="tl-sess" data-act="del-session" data-id="${session.id}" title="${escapeHtml(session.taskTitle)} · 삭제"
                    style="top:${part.hour * 34 + 7}px;left:${(part.startSecond / 3600) * 100}%;width:${Math.max(0.8, (part.durationSeconds / 3600) * 100)}%;background:${cat?.color || "#2563eb"}"></button>`,
              );
            })
            .join("")}
        </div>
      </div>
    </div>`;
}

function viewCalendar() {
  const days = makeCalendarDays(ui.month);
  const selected = ui.date;
  const selectedKey = dateKeyFrom(selected);
  const week = ["일", "월", "화", "수", "목", "금", "토"];
  const s = store.getState();
  return `
    ${top("캘린더", `${ui.month.getFullYear()}년 ${ui.month.getMonth() + 1}월`, `
      <button class="ghost" data-act="month-prev">${icon("chevronLeft")}</button>
      <button class="ghost" data-act="cal-today">오늘</button>
      <button class="ghost" data-act="month-next">${icon("chevronRight")}</button>
      <button class="primary" data-act="open-event">${icon("plus", 14)} 일정 추가</button>
    `)}
    <div class="cal-grid">
      ${week.map((name) => `<div class="cal-head">${name}</div>`).join("")}
      ${days
        .map((date) => {
          const key = formatDateKey(date);
          const out = date.getMonth() !== ui.month.getMonth();
          const prog = store.progressOn(key);
          const events = s.events.filter((event) => event.date === key).slice(0, 2);
          const isToday = key === todayKey();
          const isSelected = key === selectedKey;
          return `<button class="cal-cell ${out ? "out" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" data-act="pick-day" data-key="${key}">
            <span class="cal-num">${date.getDate()}</span>
            ${
              prog.total
                ? `<span class="mini-track" title="이수율 ${prog.percent}%"><span class="mini-fill" style="transform:scaleX(${prog.percent / 100})"></span></span>
                   <span class="cal-pct">${prog.percent}%</span>`
                : ""
            }
            ${events.map((event) => `<span class="event-chip" style="background:${eventColorValue(event.color)}">${escapeHtml(event.title)}</span>`).join("")}
          </button>`;
        })
        .join("")}
    </div>
    <div class="group-title">선택한 날 할 일</div>
    <div class="list">
      ${
        store.tasksOn(selectedKey).length
          ? store.tasksOn(selectedKey).map((task) => taskRow(task, { hidePlay: true, hideActions: true })).join("")
          : `<div class="empty">할 일이 없습니다.</div>`
      }
    </div>
    <div class="group-title">일정</div>
    <div class="list">
      ${
        s.events.filter((event) => event.date === selectedKey).length
          ? s.events
              .filter((event) => event.date === selectedKey)
              .map(
                (event) =>
                  `<div class="task"><div class="dot" style="background:${eventColorValue(event.color)}"></div><button type="button" class="event-open" data-act="show-event" data-id="${event.id}"><div class="task-title">${escapeHtml(event.title)}</div><div class="task-meta">${event.startTime}–${event.endTime}</div></button><button class="icon-btn" data-act="del-event" data-id="${event.id}">${icon("trash", 14)}</button></div>`,
              )
              .join("")
          : `<div class="empty">일정이 없습니다.</div>`
      }
    </div>`;
}

const TT_START_HOUR = 8;
const TT_END_HOUR = 22;
const TT_ROW = 48;

function timetableDayFromDate(date) {
  const js = date instanceof Date ? date.getDay() : new Date().getDay();
  return js === 0 ? 7 : js;
}

function weekdayLabel(date) {
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][date instanceof Date ? date.getDay() : new Date().getDay()];
}

function normalizeTimetableDay(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 7;
  if (n >= 1 && n <= 7) return n;
  return 0;
}

function viewTodaySchedule() {
  const date = ui.date instanceof Date ? ui.date : new Date();
  const isToday = dateKeyFrom(date) === todayKey();
  const title = isToday ? "오늘 시간표" : `${weekdayLabel(date)} 시간표`;
  return `
    <aside class="today-split-schedule">
      <div class="today-sched-card">
        <div class="today-sched-head">
          <b>${escapeHtml(title)}</b>
          <a href="#/timetable">시간표 탭에서 관리</a>
        </div>
        ${viewTimetableGrid(store.primaryCourses(), {
          onlyDay: timetableDayFromDate(date),
          now: isToday,
          events: store.eventsOn(dateKeyFrom(date)),
        })}
      </div>
    </aside>`;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function defaultCourseSlot() {
  return { day: 1, startTime: "09:00", endTime: "10:30" };
}

function slotsOverlap(a, b) {
  if (Number(a.day) !== Number(b.day)) return false;
  return timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(a.endTime) > timeToMinutes(b.startTime);
}

function coursesOverlap(a, b) {
  const left = store.courseSlots(a);
  const right = store.courseSlots(b);
  return left.some((slotA) => right.some((slotB) => slotsOverlap(slotA, slotB)));
}

function draftSlotsOverlap(slots) {
  return (slots || []).some((slot, i) =>
    slots.some((other, j) => j > i && slotsOverlap(slot, other)),
  );
}

function timetableDays(courses) {
  const list = Array.isArray(courses) ? courses : [];
  const maxDay = list.length
    ? Math.max(1, ...list.flatMap((course) => store.courseSlots(course).map((slot) => Number(slot.day) || 1)))
    : 5;
  const dayCount = Math.max(5, maxDay);
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"].slice(0, dayCount);
  return { dayCount, dayLabels };
}

function resetCourseDrafts() {
  ui.courseId = null;
  ui.courseSlotsDraft = null;
  ui.courseColorDraft = "";
  ui.courseFormDraft = null;
  ui.courseDeleteConfirm = false;
}

function applyCourseColorDraft(color) {
  const hex = String(color || "").trim();
  if (!hex) return;
  ui.courseColorDraft = hex;
  const key = hex.toLowerCase();
  document.querySelectorAll(".course-color-swatch").forEach((btn) => {
    btn.classList.toggle("on", String(btn.dataset.color || "").toLowerCase() === key);
  });
  const hidden = document.querySelector("form[data-act='add-course'] [name='color']");
  if (hidden) hidden.value = hex;
  const picker = document.querySelector("[data-act='course-color-pick']");
  if (picker && /^#[0-9A-Fa-f]{6}$/.test(hex) && picker.value.toLowerCase() !== key) picker.value = hex;
}

function courseColorTiles() {
  const locked = [...new Set((store.getState().categories || []).map((item) => String(item.color || "").toLowerCase()).filter((item) => /^#[0-9a-f]{6}$/.test(item)))];
  const extras = (store.getState().coursePresetColors || []).filter((item) => !locked.includes(String(item).toLowerCase()));
  return [
    ...locked.map((value) => ({ value, locked: true })),
    ...extras.map((value) => ({ value, locked: false })),
  ];
}

function snapshotCourseForm() {
  const form = document.querySelector("form[data-act='add-course']");
  if (!form) return;
  ui.courseFormDraft = {
    title: form.title?.value || "",
    professor: form.professor?.value || "",
    room: form.room?.value || "",
    memo: form.memo?.value || "",
  };
}

function syncCourseSlotDraft(el) {
  const idx = Number(el.dataset.idx);
  const field = el.dataset.field;
  if (!Array.isArray(ui.courseSlotsDraft) || Number.isNaN(idx) || !field) return;
  ui.courseSlotsDraft = ui.courseSlotsDraft.map((slot, i) =>
    i === idx ? { ...slot, [field]: field === "day" ? Number(el.value) : el.value } : slot,
  );
}

function activeTimetableId() {
  const list = store.getTimetables();
  const id = ui.timetableId || store.getState().primaryTimetableId;
  return list.some((item) => item.id === id) ? id : list[0]?.id || "";
}

const TT_MENU_HINT_KEY = "focus-tt-menu-hint-v1";

function ttMenuHintOpen() {
  try {
    return localStorage.getItem(TT_MENU_HINT_KEY) !== "1";
  } catch {
    return false;
  }
}

function dismissTtMenuHint() {
  try {
    localStorage.setItem(TT_MENU_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

function timetableSwitcherHtml() {
  const list = store.getTimetables();
  const active = activeTimetableId();
  const primary = store.getState().primaryTimetableId;
  const canDelete = list.length > 1;
  const isPrimary = active === primary;
  const menuOpen = Boolean(ui.timetableMenu);
  const showHint = canDelete && !menuOpen && ttMenuHintOpen();
  return `
    <div class="tt-switch">
      <span class="tt-switch-label">시간표</span>
      <div class="tt-chip-row">
        ${list
          .map(
            (item) =>
              `<button type="button" class="tt-chip ${item.id === active ? "on" : ""}" data-act="select-timetable" data-id="${item.id}">
                ${escapeHtml(item.name)}
                ${item.id === primary ? `<span class="tt-chip-mark">대표</span>` : ""}
              </button>`,
          )
          .join("")}
        <button type="button" class="tt-chip-add" data-act="add-timetable" title="시간표 추가" aria-label="시간표 추가">${icon("plus", 14)}</button>
      </div>
      <div class="tt-switch-more">
        <button type="button" class="icon-btn ${menuOpen ? "on" : ""}" data-act="tt-menu" title="선택한 시간표 편집: 이름 변경, 복제, 대표 설정, 삭제" aria-label="선택한 시간표 편집" aria-expanded="${menuOpen ? "true" : "false"}">${icon("moreVertical", 16)}</button>
        ${showHint ? `<span class="tt-switch-hint" role="status">이름 변경 · 복제 · 대표 설정 · 삭제는 여기</span>` : ""}
        ${
          menuOpen
            ? `<div class="tt-switch-pop">
                ${isPrimary ? `<p class="tt-switch-note">그룹·오늘 할 일에 보이는 대표 시간표입니다</p>` : ""}
                <button type="button" data-act="rename-timetable" data-id="${active}">이름 변경</button>
                <button type="button" data-act="duplicate-timetable" data-id="${active}">복제</button>
                ${isPrimary ? "" : `<button type="button" data-act="set-primary-timetable" data-id="${active}">대표로 설정</button>`}
                <button type="button" class="danger-text" data-act="del-timetable" data-id="${active}" ${canDelete ? "" : "disabled"}>삭제</button>
              </div>`
            : ""
        }
      </div>
    </div>`;
}

function viewTimetable() {
  const tab = ui.timetableTab === "gpa" ? "gpa" : "grid";
  const extra =
    tab === "grid"
      ? `<button class="primary" data-act="open-course">${icon("plus", 14)} 수업 추가</button>`
      : "";
  return `
    ${top("시간표", tab === "gpa" ? "학기별 성적을 직접 입력" : "과목명 · 시간 · 강의실을 직접 입력", extra)}
    <div class="gpa-tabs">
      <button type="button" class="gpa-tab ${tab === "grid" ? "on" : ""}" data-act="tt-tab" data-tab="grid">주간 시간표</button>
      <button type="button" class="gpa-tab ${tab === "gpa" ? "on" : ""}" data-act="tt-tab" data-tab="gpa">학점 계산기</button>
    </div>
    ${tab === "gpa" ? viewGpa() : `${timetableSwitcherHtml()}${viewTimetableGrid(store.coursesIn(activeTimetableId()))}`}`;
}

function ttHexColor(value, fallback = "#2563eb") {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || "")) ? value : fallback;
}

function ttBlockGeometry(startTime, endTime) {
  const startBound = TT_START_HOUR * 60;
  const endBound = TT_END_HOUR * 60;
  const startRaw = timeToMinutes(startTime);
  const endRaw = timeToMinutes(endTime);
  const start = Math.max(startBound, startRaw);
  const end = Math.min(endBound, endRaw);
  if (end <= start) return null;
  const rawH = ((end - start) / 60) * TT_ROW;
  return {
    startRaw,
    endRaw,
    start,
    end,
    top: ((start - startBound) / 60) * TT_ROW + 3,
    height: Math.max(22, rawH - 6),
  };
}

function ttCourseItems(courses, { onlyDay, dayCount }) {
  const items = [];
  for (const course of courses) {
    for (const slot of store.courseSlots(course)) {
      const day = Number(slot.day) || 1;
      if (onlyDay) {
        if (day !== onlyDay) continue;
      } else if (day < 1 || day > dayCount) {
        continue;
      }
      const geo = ttBlockGeometry(slot.startTime, slot.endTime);
      if (!geo) continue;
      items.push({
        kind: "course",
        id: course.id,
        title: course.title || "수업",
        color: ttHexColor(course.color, "#2563eb"),
        meta: [course.room, course.professor].filter(Boolean).join(" · "),
        startLabel: slot.startTime,
        endLabel: slot.endTime,
        day,
        lane: 0,
        lanes: 1,
        ...geo,
      });
    }
  }
  return items;
}

function ttEventItems(events, day) {
  return (Array.isArray(events) ? events : [])
    .map((event) => {
      const geo = ttBlockGeometry(event.startTime || "09:00", event.endTime || "10:00");
      if (!geo) return null;
      const startLabel = event.startTime || "09:00";
      const endLabel = event.endTime || "10:00";
      return {
        kind: "event",
        id: event.id,
        title: event.title || "일정",
        color: ttHexColor(event.color, "#2563eb"),
        meta: `일정 · ${startLabel}–${endLabel}`,
        startLabel,
        endLabel,
        day,
        lane: 0,
        lanes: 1,
        ...geo,
      };
    })
    .filter(Boolean);
}

function packTimetableLanes(items) {
  if (!items.length) return items;
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters = [];
  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || item.start >= last.end) {
      clusters.push({ end: item.end, items: [item] });
    } else {
      last.items.push(item);
      last.end = Math.max(last.end, item.end);
    }
  }
  for (const cluster of clusters) {
    const colEnds = [];
    for (const item of cluster.items) {
      let lane = colEnds.findIndex((end) => item.start >= end);
      if (lane < 0) {
        lane = colEnds.length;
        colEnds.push(item.end);
      } else {
        colEnds[lane] = item.end;
      }
      item.lane = lane;
    }
    const lanes = Math.max(1, colEnds.length);
    for (const item of cluster.items) item.lanes = lanes;
  }
  return items;
}

function viewTimetableGrid(courses = [], opts = {}) {
  const onlyDay = normalizeTimetableDay(opts.onlyDay);
  const week = timetableDays(courses);
  const weekLabels = ["월", "화", "수", "목", "금", "토", "일"];
  const dayCount = onlyDay ? 1 : week.dayCount;
  const dayLabels = onlyDay ? [weekLabels[onlyDay - 1]] : week.dayLabels;
  const hours = Array.from({ length: TT_END_HOUR - TT_START_HOUR + 1 }, (_, i) => i + TT_START_HOUR);
  const gridHeight = (TT_END_HOUR - TT_START_HOUR) * TT_ROW;
  const todayDay = timetableDayFromDate(new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = nowMin > TT_START_HOUR * 60 && nowMin < TT_END_HOUR * 60 && (onlyDay ? opts.now === true : true);
  const nowTop = ((nowMin - TT_START_HOUR * 60) / 60) * TT_ROW;
  const includeEvents = Array.isArray(opts.events);
  const items = ttCourseItems(courses, { onlyDay, dayCount });
  if (includeEvents && onlyDay) items.push(...ttEventItems(opts.events, onlyDay));
  if (includeEvents && onlyDay) packTimetableLanes(items);
  let nextStart = -1;
  let nextEnd = -1;
  if (onlyDay && showNow) {
    const rows = [...items].sort((a, b) => a.startRaw - b.startRaw || a.endRaw - b.endRaw);
    const hasLive = rows.some((row) => nowMin >= row.startRaw && nowMin < row.endRaw);
    const next = hasLive ? null : rows.find((row) => row.startRaw > nowMin);
    if (next) {
      nextStart = next.startRaw;
      nextEnd = next.endRaw;
    }
  }
  return `
    <div class="tt-wrap" style="--tt-days:${dayCount};--tt-row:${TT_ROW}px;--tt-gutter:48px">
      <div class="tt-days">
        <div class="tt-day-head gutter" aria-hidden="true"></div>
        ${dayLabels
          .map((label, i) => {
            const day = onlyDay || i + 1;
            const isTodayCol = onlyDay ? opts.now === true && day === todayDay : day === todayDay;
            return `<div class="tt-day-head ${isTodayCol ? "today" : ""}">${label}</div>`;
          })
          .join("")}
      </div>
      <div class="tt-grid" style="height:${gridHeight}px" aria-label="${onlyDay ? "요일 시간표" : "주간 시간표"}">
        ${hours
          .map(
            (hour, i) =>
              `<div class="tt-hour${i === 0 ? " first" : ""}${i === hours.length - 1 ? " end" : ""}" style="top:${(hour - TT_START_HOUR) * TT_ROW}px"><span>${String(hour).padStart(2, "0")}</span></div>`,
          )
          .join("")}
        <div class="tt-plot">
          ${dayLabels
            .map((_, i) => {
              const day = onlyDay || i + 1;
              const isTodayCol = onlyDay ? opts.now === true && day === todayDay : day === todayDay;
              return `<div class="tt-col${isTodayCol ? " today" : ""}${i === dayCount - 1 ? " last" : ""}" style="left:${(i / dayCount) * 100}%;width:${(1 / dayCount) * 100}%"></div>`;
            })
            .join("")}
          ${items
            .map((item) => {
              const col = onlyDay ? 0 : item.day - 1;
              const colShare = 100 / dayCount;
              const laneShare = colShare / item.lanes;
              const left = col * colShare + item.lane * laneShare;
              const width = laneShare;
              const pad = item.lanes > 1 ? 3 : 5;
              const short = item.height < 40 ? " short" : "";
              const live = onlyDay && showNow && nowMin >= item.startRaw && nowMin < item.endRaw;
              const next = onlyDay && showNow && nextStart >= 0 && item.startRaw === nextStart && item.endRaw === nextEnd;
              const mark = live ? "진행" : next ? "다음" : "";
              const isEvent = item.kind === "event";
              const act = isEvent ? "show-event" : "edit-course";
              const label = isEvent ? `${icon("calendar", 11)}` : "";
              return `<button type="button" class="tt-block${short}${live ? " now" : ""}${next ? " next" : ""}${isEvent ? " event" : ""}" data-act="${act}" data-id="${item.id}"
                style="top:${item.top}px;height:${item.height}px;left:calc(${left}% + ${pad}px);width:calc(${width}% - ${pad * 2}px);--tt-color:${item.color}"
                title="${escapeHtml([item.title, item.startLabel, item.endLabel, item.meta].filter(Boolean).join(" · "))}">
                <span class="tt-name">${label}${escapeHtml(item.title)}${mark ? `<span class="due-chip">${mark}</span>` : ""}</span>
                ${item.meta ? `<span class="tt-room">${escapeHtml(item.meta)}</span>` : ""}
              </button>`;
            })
            .join("")}
          ${showNow ? `<div class="tt-now" style="top:${nowTop}px" aria-hidden="true"></div>` : ""}
        </div>
      </div>
    </div>`;
}

function currentSemester() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() < 7 ? "1" : "2"}`;
}

function formatGpa(value) {
  return Number(value || 0).toFixed(2);
}

function gpaTrendChart(records) {
  const semesters = [...new Set((records || []).map((row) => row.semester).filter(Boolean))].sort();
  if (semesters.length < 3) {
    return `<p class="page-date gpa-trend-empty">학기를 3개 이상 입력하면 평점 추이를 보여줍니다.</p>`;
  }
  const values = semesters.map((semester) => store.calcGpa(records.filter((row) => row.semester === semester)).gpa45);
  const width = 360;
  const height = 96;
  const padX = 18;
  const padY = 14;
  const min = 0;
  const max = 4.5;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const xs = values.map((_, i) => padX + (values.length === 1 ? innerW / 2 : (i * innerW) / (values.length - 1)));
  const ys = values.map((value) => padY + (1 - (Math.min(max, Math.max(min, value)) - min) / (max - min)) * innerH);
  const points = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return `
    <figure class="gpa-trend">
      <figcaption>학기별 평점 추이 <small>4.5 만점</small></figcaption>
      <svg class="gpa-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="학기별 평점 추이">
        <line class="gpa-trend-axis" x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}"></line>
        <polyline class="gpa-trend-line" fill="none" points="${points}"></polyline>
        ${xs
          .map(
            (x, i) =>
              `<circle class="gpa-trend-dot" cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3.5">
                <title>${escapeHtml(semesters[i])} · ${formatGpa(values[i])}</title>
              </circle>`,
          )
          .join("")}
      </svg>
      <div class="gpa-trend-labels">
        ${semesters.map((semester) => `<span>${escapeHtml(semester)}</span>`).join("")}
      </div>
    </figure>`;
}

function neededTermGpa(target, earnedCredit, earnedPoints, remainCredit) {
  const remain = Number(remainCredit);
  const earned = Number(earnedCredit) || 0;
  const points = Number(earnedPoints) || 0;
  const goal = Number(target);
  if (!Number.isFinite(remain) || remain <= 0 || !Number.isFinite(goal)) return null;
  return (goal * (earned + remain) - points) / remain;
}

function gpaSimResultHtml(earned) {
  const remain = Number(ui.gpaRemain);
  const target = Number(ui.gpaTarget);
  if (!Number.isFinite(remain) || remain <= 0 || !Number.isFinite(target) || target <= 0) {
    return `<p class="page-date">목표 평점과 남은 학점을 입력하세요.</p>`;
  }
  const need45 = neededTermGpa(target, earned.totalCredit, earned.points45, remain);
  const need43 = neededTermGpa(target, earned.totalCredit, earned.points43, remain);
  if (need45 == null) return `<p class="page-date">목표 평점과 남은 학점을 입력하세요.</p>`;
  if (need45 <= 0) {
    return `<p class="gpa-sim-ok">이미 목표 평점을 넘었습니다.</p>`;
  }
  const blocked45 = need45 > 4.5 + 1e-9;
  const blocked43 = need43 > 4.3 + 1e-9;
  return `
    <p class="gpa-sim-need">남은 ${remain}학점에서 4.5 만점 기준 <b>${formatGpa(need45)}</b> · 4.3 만점 기준 <b>${formatGpa(need43)}</b>가 필요합니다.</p>
    ${
      blocked45 || blocked43
        ? `<p class="gpa-sim-warn">이 학기 남은 과목만으로는 달성 불가합니다.${blocked45 ? " (4.5 만점 초과)" : ""}${blocked43 ? " (4.3 만점 초과)" : ""}</p>`
        : ""
    }`;
}

function gpaSimulatorHtml(filter, earned) {
  if (!filter) {
    return `<p class="page-date">학기를 고르면 이번 학기 남은 학점으로 목표 평점을 역산할 수 있습니다.</p>`;
  }
  return `
    <form class="gpa-sim" data-act="gpa-sim">
      <p class="gpa-sim-lead">${escapeHtml(filter)} 기준 · 이미 입력한 ${earned.totalCredit}학점(${formatGpa(earned.gpa45)} / 4.5)에 남은 학점을 더해 누적 목표를 맞춥니다.</p>
      <label class="due-field">목표 평점 (4.5)
        <input class="field" name="target" data-act="gpa-target" type="number" min="0" max="4.5" step="0.01" value="${escapeHtml(ui.gpaTarget)}" required>
      </label>
      <label class="due-field">남은 학점 수
        <input class="field" name="remain" data-act="gpa-remain" type="number" min="0.5" max="30" step="0.5" value="${escapeHtml(ui.gpaRemain)}" required>
      </label>
      <div class="gpa-sim-out" data-gpa-sim-out>${gpaSimResultHtml(earned)}</div>
    </form>`;
}

function viewGpa() {
  const records = store.getState().gradeRecords || [];
  const grades = Object.keys(store.GRADE_POINTS_45);
  const semesters = [...new Set(records.map((row) => row.semester))].sort().reverse();
  const filter = ui.gpaSemester || "";
  const visible = filter ? records.filter((row) => row.semester === filter) : records;
  const all = store.calcGpa(visible);
  const major = store.calcGpa(visible, { majorOnly: true });
  const grouped = {};
  for (const row of visible) {
    (grouped[row.semester] ||= []).push(row);
  }
  const sections = Object.keys(grouped).sort().reverse();
  return `
    <section class="gpa-summary" aria-label="학점 요약">
      <div class="gpa-stat">
        <span>전체 평점평균</span>
        <b>${formatGpa(all.gpa43)} <small>/ 4.3</small></b>
        <em>${formatGpa(all.gpa45)} / 4.5</em>
      </div>
      <div class="gpa-stat">
        <span>전공 평점평균</span>
        <b>${formatGpa(major.gpa43)} <small>/ 4.3</small></b>
        <em>${formatGpa(major.gpa45)} / 4.5</em>
      </div>
      <div class="gpa-stat">
        <span>전체 이수학점</span>
        <b>${all.totalCredit}</b>
      </div>
      <div class="gpa-stat">
        <span>전공 이수학점</span>
        <b>${major.totalCredit}</b>
      </div>
      ${(() => {
        const earned = store.calcGpa(records);
        const goal = Number(store.getState().settings?.graduationCredits) || 130;
        const ratio = goal ? Math.min(1, earned.totalCredit / goal) : 0;
        return `<div class="gpa-grad">
          <div class="progress-head">
            <span class="progress-label">졸업 이수학점</span>
            <span class="progress-value">${earned.totalCredit} / ${goal}</span>
          </div>
          <div class="track" aria-hidden="true"><div class="fill" style="transform:scaleX(${ratio.toFixed(3)})"></div></div>
        </div>`;
      })()}
    </section>
    ${gpaTrendChart(records)}
    ${gpaSimulatorHtml(filter, store.calcGpa(records))}
    <form class="gpa-form" data-act="add-grade">
      <input class="field" name="semester" placeholder="학기 (예: 2026-2)" value="${escapeHtml(filter || currentSemester())}" required>
      <input class="field" name="title" placeholder="과목명" required>
      <input class="field" name="credit" type="number" min="0" max="6" step="0.5" value="3" required>
      <select class="field" name="grade">
        ${grades.map((grade) => `<option value="${grade}">${grade}</option>`).join("")}
      </select>
      <label class="gpa-major-field"><input type="checkbox" name="isMajor" checked> 전공</label>
      <button class="primary" type="submit">과목 추가</button>
    </form>
    <div class="gpa-filter">
      <button type="button" class="gpa-chip ${filter === "" ? "on" : ""}" data-act="gpa-semester" data-semester="">전체 학기 누적</button>
      ${semesters
        .map(
          (semester) =>
            `<button type="button" class="gpa-chip ${filter === semester ? "on" : ""}" data-act="gpa-semester" data-semester="${escapeHtml(semester)}">${escapeHtml(semester)}</button>`,
        )
        .join("")}
      <button type="button" class="gpa-chip" data-act="export-gpa-csv">CSV 내보내기</button>
    </div>
    ${
      sections.length
        ? sections
            .map((semester) => {
              const rows = grouped[semester];
              const sub = store.calcGpa(rows);
              return `
                <div class="group-title gpa-group">${escapeHtml(semester)} · ${rows.length}과목 · ${formatGpa(sub.gpa45)} / 4.5</div>
                <div class="list">
                  ${rows
                    .map(
                      (row) => `
                        <div class="task gpa-row">
                          <button type="button" class="gpa-major ${row.isMajor ? "on" : ""}" data-act="toggle-grade-major" data-id="${row.id}">${row.isMajor ? "전공" : "교양"}</button>
                          <div>
                            <div class="task-title">${escapeHtml(row.title)}</div>
                            <div class="task-meta">${row.credit}학점 · ${escapeHtml(row.grade)}</div>
                          </div>
                          <span class="dur">${escapeHtml(row.grade)}</span>
                          <button class="icon-btn" data-act="del-grade" data-id="${row.id}" aria-label="삭제">${icon("trash", 14)}</button>
                        </div>`,
                    )
                    .join("")}
                </div>`;
            })
            .join("")
        : `<div class="empty">아직 입력한 성적이 없습니다.</div>`
    }`;
}

function htmlToText(html) {
  const node = document.createElement("div");
  node.innerHTML = html || "";
  return node.innerText.replace(/\u00a0/g, " ");
}

function isSafeColorValue(value) {
  return /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)|[a-z]{3,20})$/i.test(
    String(value || "").trim(),
  );
}

function sanitizeStyleAttr(raw) {
  return String(raw || "")
    .split(";")
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return "";
      const prop = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      if (!val || /expression|javascript|url\s*\(|@import|behavior/i.test(val)) return "";
      if (prop === "text-align") {
        if (!/^(left|center|right|justify|start|end)$/i.test(val)) return "";
        return `text-align: ${val.toLowerCase()}`;
      }
      if (prop === "color" || prop === "background-color") {
        if (!isSafeColorValue(val)) return "";
        return `${prop}: ${val}`;
      }
      if (prop === "font-family") {
        if (val.length > 120 || !/^[\w\s\-,"']+$/.test(val)) return "";
        return `font-family: ${val}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

function isSafeHref(href) {
  return /^(https?:\/\/|mailto:)/i.test(String(href || "").trim());
}

function sanitizeNoteHtml(raw) {
  if (!raw) return "";
  const str = String(raw);
  if (!str.includes("<")) return escapeHtml(str);
  const wrap = document.createElement("div");
  wrap.innerHTML = str;
  const allowed = new Set(["b", "strong", "i", "em", "u", "s", "strike", "br", "div", "span", "p", "font", "a"]);
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) {
        child.remove();
        return;
      }
      const tag = child.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object") {
        child.remove();
        return;
      }
      walk(child);
      if (!allowed.has(tag)) {
        child.replaceWith(...child.childNodes);
        return;
      }
      const color = tag === "font" ? child.getAttribute("color") : "";
      const face = tag === "font" ? child.getAttribute("face") : "";
      const style = sanitizeStyleAttr(child.getAttribute("style"));
      const align = child.getAttribute("align");
      const href = tag === "a" ? child.getAttribute("href") : "";
      [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
      if (style) child.setAttribute("style", style);
      if (color && isSafeColorValue(color)) child.setAttribute("color", color);
      if (face && /^[\w\s\-,"']{1,80}$/.test(face)) child.setAttribute("face", face);
      if (align && /^(left|center|right)$/i.test(align)) child.setAttribute("align", align.toLowerCase());
      if (tag === "a" && isSafeHref(href)) child.setAttribute("href", href.trim());
    });
  };
  walk(wrap);
  return wrap.innerHTML;
}

function decorateNoteHtml(raw) {
  const wrap = document.createElement("div");
  wrap.innerHTML = sanitizeNoteHtml(raw);
  wrap.querySelectorAll("a[href]").forEach((anchor) => {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });
  return wrap.innerHTML;
}

function isFolderItem(page) {
  return page?.type === "folder";
}

function isPdfItem(page) {
  return page?.type === "pdf";
}

function creationParentId(page) {
  if (!page) return null;
  if (isFolderItem(page)) return page.id;
  return page.parentId || null;
}

function pageAncestors(page) {
  const crumbs = [];
  let cursor = page;
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    crumbs.unshift(cursor);
    cursor = cursor.parentId ? store.projectById(cursor.parentId) : null;
  }
  return crumbs;
}

function persistHostAlign(el) {
  if (!el) return;
  const hostAlign = String(el.style.textAlign || "").toLowerCase();
  if (!hostAlign || hostAlign === "start" || hostAlign === "initial") return;
  el.style.textAlign = "";
  const only = el.childElementCount === 1 && el.firstElementChild?.tagName === "DIV" && el.childNodes.length === 1;
  if (only) {
    el.firstElementChild.style.textAlign = hostAlign;
    return;
  }
  const wrap = document.createElement("div");
  wrap.style.textAlign = hostAlign;
  while (el.firstChild) wrap.appendChild(el.firstChild);
  el.appendChild(wrap);
}

function cloneBlocks(blocks) {
  return JSON.parse(JSON.stringify(blocks || []));
}

let noteHistoryTimer = 0;
let noteHistoryArmed = false;

function resetNoteHistory(pageId, tabId) {
  if (ui.noteHistory.pageId === pageId && ui.noteHistory.tabId === tabId) return;
  clearTimeout(noteHistoryTimer);
  noteHistoryArmed = false;
  ui.noteHistory = { pageId: pageId || null, tabId: tabId || null, past: [], future: [] };
}

function captureNoteHistory(pageId, debounce) {
  if (!pageId) return;
  const page = store.projectById(pageId);
  const tabId = page?.activeTabId || null;
  if (ui.noteHistory.pageId !== pageId || ui.noteHistory.tabId !== tabId) resetNoteHistory(pageId, tabId);
  const snap = cloneBlocks(page?.blocks);
  const push = () => {
    const last = ui.noteHistory.past[ui.noteHistory.past.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    ui.noteHistory.past.push(snap);
    if (ui.noteHistory.past.length > NOTE_HISTORY_MAX) ui.noteHistory.past.shift();
    ui.noteHistory.future = [];
  };
  if (debounce) {
    if (noteHistoryArmed) return;
    noteHistoryArmed = true;
    push();
    clearTimeout(noteHistoryTimer);
    noteHistoryTimer = setTimeout(() => {
      noteHistoryArmed = false;
      noteHistoryTimer = 0;
    }, 500);
    return;
  }
  noteHistoryArmed = false;
  clearTimeout(noteHistoryTimer);
  noteHistoryTimer = 0;
  push();
}

function commitBlocks(pageId, blocks, opts = {}) {
  if (!opts.fromHistory) captureNoteHistory(pageId, Boolean(opts.debounce));
  store.setBlocks(pageId, blocks);
}

function undoNote() {
  const page = store.projectById(currentPageId());
  if (
    !page ||
    isFolderItem(page) ||
    ui.noteHistory.pageId !== page.id ||
    ui.noteHistory.tabId !== (page.activeTabId || null) ||
    !ui.noteHistory.past.length
  ) {
    return;
  }
  noteHistoryArmed = false;
  clearTimeout(noteHistoryTimer);
  ui.noteHistory.future.push(cloneBlocks(page.blocks));
  const prev = ui.noteHistory.past.pop();
  commitBlocks(page.id, prev, { fromHistory: true });
  render();
  refocusBlock(ui.selectedBlockId || page.blocks[0]?.id);
}

function redoNote() {
  const page = store.projectById(currentPageId());
  if (
    !page ||
    isFolderItem(page) ||
    ui.noteHistory.pageId !== page.id ||
    ui.noteHistory.tabId !== (page.activeTabId || null) ||
    !ui.noteHistory.future.length
  ) {
    return;
  }
  noteHistoryArmed = false;
  clearTimeout(noteHistoryTimer);
  ui.noteHistory.past.push(cloneBlocks(page.blocks));
  const next = ui.noteHistory.future.pop();
  commitBlocks(page.id, next, { fromHistory: true });
  render();
  refocusBlock(ui.selectedBlockId || page.blocks[0]?.id);
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceInHtml(html, find, repl) {
  const needle = String(find || "");
  if (!needle) return html || "";
  const rx = new RegExp(escapeRegExp(needle), "gi");
  return String(html || "").replace(/(<[^>]+>)|([^<]+)/g, (all, tag, text) => (tag ? tag : text.replace(rx, repl)));
}

function collectFindMatches(page, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q || !page) return [];
  const hits = [];
  (page.blocks || []).forEach((block) => {
    if (["image", "file", "pdf", "divider", "toc"].includes(block.type)) return;
    if (block.type === "table") {
      const cells = [...(block.headers || []), ...(block.rows || []).flat()];
      cells.forEach((cell) => {
        const lower = String(cell || "").toLowerCase();
        let from = 0;
        while (from <= lower.length) {
          const at = lower.indexOf(q, from);
          if (at < 0) break;
          hits.push({ blockId: block.id });
          from = at + q.length;
        }
      });
      return;
    }
    const lower = htmlToText(block.text || "").toLowerCase();
    let from = 0;
    let nth = 0;
    while (from <= lower.length) {
      const at = lower.indexOf(q, from);
      if (at < 0) break;
      hits.push({ blockId: block.id, nth });
      nth += 1;
      from = at + q.length;
    }
  });
  return hits;
}

function selectQueryIn(el, query, nth = 0) {
  if (!el || !query) return false;
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const lower = node.data.toLowerCase();
    let from = 0;
    while (from <= lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      if (seen === nth) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + query.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        el.scrollIntoView({ block: "center", inline: "nearest" });
        return true;
      }
      seen += 1;
      from = at + needle.length;
    }
  }
  return false;
}

function findNextMatch() {
  const page = store.projectById(currentPageId());
  const hits = collectFindMatches(page, ui.findQ);
  if (!hits.length) {
    alert("찾는 내용이 없습니다.");
    return;
  }
  ui.findIndex = ui.findIndex % hits.length;
  const hit = hits[ui.findIndex];
  ui.findIndex = (ui.findIndex + 1) % hits.length;
  const blockEl = document.querySelector(`[data-block="${hit.blockId}"]`);
  const editable = blockEl?.querySelector("[data-act='block']") || blockEl;
  ui.selectedBlockId = hit.blockId;
  if (editable) selectQueryIn(editable, ui.findQ, hit.nth || 0);
  else blockEl?.scrollIntoView({ block: "center" });
}

function replaceAllMatches() {
  const page = store.projectById(currentPageId());
  const find = String(ui.findQ || "").trim();
  if (!page || !find) return;
  const repl = ui.replaceQ || "";
  const rx = new RegExp(escapeRegExp(find), "gi");
  const next = page.blocks.map((block) => {
    if (block.type === "table") {
      return {
        ...block,
        headers: (block.headers || []).map((cell) => String(cell || "").replace(rx, repl)),
        rows: (block.rows || []).map((row) => row.map((cell) => String(cell || "").replace(rx, repl))),
      };
    }
    if (!("text" in block) || ["image", "file", "pdf", "divider", "toc"].includes(block.type)) return block;
    return { ...block, text: replaceInHtml(block.text || "", find, repl) };
  });
  commitBlocks(page.id, next);
  render();
}

function insertAtCaret(text) {
  const live = document.querySelector(`[data-id="${ui.selectedBlockId}"]`) || document.querySelector("[data-act='block']");
  if (!live) return;
  live.focus();
  document.execCommand("insertText", false, text);
  ui.selectedBlockId = live.dataset.id;
  saveBlockFromEl(live);
}

function linkAtSelection() {
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return el?.closest?.("a") || null;
}

function applyNoteLink() {
  const existing = linkAtSelection();
  const current = existing?.getAttribute("href") || "";
  const next = prompt(existing ? "링크 URL (비우면 제거)" : "링크 URL", current);
  if (next === null) return;
  if (!String(next).trim()) {
    document.execCommand("unlink");
  } else {
    const href = String(next).trim();
    const withProto = /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
    if (existing) existing.setAttribute("href", withProto);
    else document.execCommand("createLink", false, withProto);
  }
  const live = document.querySelector(`[data-id="${ui.selectedBlockId}"]`);
  if (live) saveBlockFromEl(live);
}

function headingPath(page) {
  return pageAncestors(page)
    .slice(0, -1)
    .map((item) => item.name || "제목 없음")
    .join(" / ");
}

function folderSearchHits(scope, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  return store
    .getState()
    .projects.filter((page) => (page.groupId || null) === (scope || null))
    .filter((page) => store.noteMatches(page, q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function folderItemMark(item) {
  if (isFolderItem(item)) return { klass: "folder", name: "folder" };
  if (isPdfItem(item)) return { klass: "pdf", name: "pdf" };
  return { klass: "leaf", name: "page" };
}

function folderSearchHtml(scope, query) {
  const hits = folderSearchHits(scope, query);
  if (!hits.length) return `<div class="folder-empty">일치하는 폴더나 페이지가 없습니다.</div>`;
  return `<div class="folder-hits">
    ${hits
      .map((item) => {
        const mark = folderItemMark(item);
        const path = headingPath(item) || "홈";
        return `<button type="button" class="folder-hit" data-act="open-page" data-id="${item.id}">
          <span class="folder-card-ico ${mark.klass}">${icon(mark.name, 18)}</span>
          <span class="folder-hit-copy">
            <span class="folder-hit-name">${escapeHtml(item.name || "제목 없음")}</span>
            <span class="folder-hit-path">${escapeHtml(path)}</span>
          </span>
        </button>`;
      })
      .join("")}
  </div>`;
}

function folderBodyHtml(page, scope) {
  const query = (ui.noteQuery || "").trim();
  return query ? folderSearchHtml(scope, query) : folderCardsHtml(page?.id || null, scope);
}

function commentThreadHtml(block) {
  const comments = block.comments || [];
  return `<div class="note-comment-pop" data-stop="1">
    <div class="note-comment-list">
      ${
        comments.length
          ? comments
              .map(
                (item) =>
                  `<div class="note-comment-item">
                    <p>${escapeHtml(item.text)}</p>
                    <span>${noteListWhen(item.createdAt)}</span>
                    <button type="button" data-act="del-comment" data-id="${block.id}" data-cid="${item.id}" aria-label="댓글 삭제">${icon("x", 12)}</button>
                  </div>`,
              )
              .join("")
          : `<div class="note-comment-empty">아직 댓글이 없습니다.</div>`
      }
    </div>
    <form class="note-comment-form" data-act="add-comment" data-id="${block.id}">
      <input name="text" value="${escapeHtml(ui.commentDraft)}" placeholder="댓글 남기기" autocomplete="off">
      <button class="primary" type="submit">추가</button>
    </form>
  </div>`;
}

function commentUi(block) {
  const n = (block.comments || []).length;
  return `<button type="button" class="note-comment-btn ${n ? "on" : ""}" data-act="toggle-comment" data-id="${block.id}" title="댓글">${icon("comment", 14)}${n ? `<span>${n}</span>` : ""}</button>
    ${ui.commentBlockId === block.id ? commentThreadHtml(block) : ""}`;
}

function tocHtml(blocks) {
  const items = (blocks || []).filter((block) => block.type === "heading" || block.type === "subheading");
  if (!items.length) return `<div class="note-toc muted">문서에 제목이 없습니다. 제목 스타일을 넣으면 목차가 채워집니다.</div>`;
  return `<nav class="note-toc" aria-label="목차">
    <div class="note-toc-label">목차</div>
    ${items
      .map(
        (block) =>
          `<button type="button" class="note-toc-item ${block.type}" data-act="jump-block" data-id="${block.id}">${escapeHtml(htmlToText(block.text || "") || "제목 없음")}</button>`,
      )
      .join("")}
  </nav>`;
}

function findBarHtml() {
  if (!ui.findOpen) return "";
  return `<div class="note-find" data-find-bar>
    <input data-act="find-q" value="${escapeHtml(ui.findQ)}" placeholder="찾을 내용" autocomplete="off">
    <input data-act="replace-q" value="${escapeHtml(ui.replaceQ)}" placeholder="바꿀 내용" autocomplete="off">
    <button type="button" class="ghost" data-act="find-next">다음</button>
    <button type="button" class="ghost" data-act="find-replace-all">모두 바꾸기</button>
    <button type="button" class="icon-btn" data-act="find-close" aria-label="닫기">${icon("x", 14)}</button>
  </div>`;
}

function noteSnippet(page) {
  const blocks =
    Array.isArray(page.tabs) && page.tabs.length
      ? page.tabs.flatMap((tab) => tab.blocks || [])
      : page.blocks || [];
  for (const block of blocks) {
    if (block.type === "image" || block.type === "divider") continue;
    if (block.type === "file" || block.type === "pdf") {
      const name = String(block.name || "").trim();
      if (name) return name;
      continue;
    }
    const text =
      block.type === "table"
        ? [...(block.headers || []), ...(block.rows || []).flat()].join(" ")
        : htmlToText(block.text || "");
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) return trimmed;
  }
  return "추가 텍스트 없음";
}

function noteListWhen(ts) {
  const date = new Date(ts || Date.now());
  if (formatDateKey(date) === todayKey()) {
    return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

function noteStamp(ts) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts || Date.now()));
}

function numberedLabel(blocks, index) {
  const indent = blocks[index].indent || 0;
  let n = 1;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (blocks[i].type !== "numbered" || (blocks[i].indent || 0) !== indent) break;
    n += 1;
  }
  return n;
}

function blockClass(type) {
  if (type === "heading") return "blk h1";
  if (type === "subheading") return "blk h2";
  if (type === "quote") return "blk quote";
  if (type === "code") return "blk code";
  if (type === "callout") return "blk callout";
  return "blk";
}

function blockTextStyle(block) {
  const parts = [];
  if (block.fontSize) parts.push(`font-size:${Number(block.fontSize)}px`);
  const family = fontCss(block.fontFamily);
  if (family) parts.push(`font-family:${family}`);
  if (block.lineHeight) parts.push(`line-height:${block.lineHeight}`);
  return parts.join(";");
}

function renderBlock(block, index, blocks) {
  const indent = Math.min(4, Math.max(0, block.indent || 0));
  const pad = indent * 28;
  if (block.type === "toc") {
    return `<div class="block note-block has-toc ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
      ${tocHtml(blocks)}
      ${commentUi(block)}
    </div>`;
  }
  if (block.type === "divider") {
    return `<div class="block note-block ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px"><div class="divider"></div>${commentUi(block)}</div>`;
  }
  if (block.type === "table") {
    const headers = block.headers || ["A", "B"];
    const rows = block.rows || [["", ""]];
    return `<div class="block note-block ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
      <div class="note-table-wrap">
        <table class="table">
          <thead><tr>${headers.map((cell, i) => `<th contenteditable="true" data-act="table" data-r="-1" data-c="${i}">${escapeHtml(cell)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row, r) => `<tr>${row.map((cell, c) => `<td contenteditable="true" data-act="table" data-r="${r}" data-c="${c}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
        <div class="table-tools">
          <button type="button" data-act="table-add-row" data-id="${block.id}">행 추가</button>
          <button type="button" data-act="table-add-col" data-id="${block.id}">열 추가</button>
          <button type="button" data-act="table-del-row" data-id="${block.id}">행 삭제</button>
        </div>
      </div>
      ${commentUi(block)}
    </div>`;
  }
  if (block.type === "image") {
    return `<div class="block note-block ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
      ${
        block.uri
          ? `<img class="note-img" src="${block.uri}" alt="">`
          : `<button class="ghost" data-act="pick-image" data-id="${block.id}">사진 선택</button>`
      }
      ${commentUi(block)}
    </div>`;
  }
  if (block.type === "pdf") {
    const name = escapeHtml(block.name || "PDF");
    const meta = formatBytes(block.size);
    if (!block.uri) {
      return `<div class="block note-block ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
        <button class="ghost" data-act="pick-pdf" data-id="${block.id}">PDF 선택</button>
        ${commentUi(block)}
      </div>`;
    }
    return `<div class="block note-block ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
      <div class="note-pdf">
        <div class="note-pdf-bar">
          <span class="note-file-ico">${icon("pdf", 18)}</span>
          <div class="note-file-copy">
            <div class="note-file-name">${name}</div>
            <div class="note-file-meta">${escapeHtml(meta ? `PDF · ${meta}` : "PDF")}</div>
          </div>
          <div class="note-pdf-actions">
            <a class="ghost" href="${block.uri}" target="_blank" rel="noopener noreferrer" data-stop="1">새 창에서 열기</a>
            <button type="button" class="ghost" data-act="toggle-pdf" data-id="${block.id}">${block.collapsed ? "펼치기" : "축소"}</button>
            <button type="button" class="ghost" data-act="pick-pdf" data-id="${block.id}">다른 파일로 교체</button>
          </div>
        </div>
        ${
          block.collapsed
            ? ""
            : `<iframe class="note-pdf-frame" src="${block.uri}#toolbar=0" title="${name}"></iframe>`
        }
      </div>
      ${commentUi(block)}
    </div>`;
  }
  if (block.type === "file") {
    const name = escapeHtml(block.name || "파일");
    const meta = [fileKind(block.mime, block.name), formatBytes(block.size)].filter(Boolean).join(" · ");
    return `<div class="block note-block ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
      <div class="note-file">
        <span class="note-file-ico">${icon("file", 18)}</span>
        <div class="note-file-copy">
          <div class="note-file-name">${name}</div>
          <div class="note-file-meta">${escapeHtml(meta || "첨부 파일")}</div>
        </div>
        ${
          block.uri
            ? `<a class="ghost" href="${block.uri}" download="${name}" data-stop="1">열기</a>`
            : `<button class="ghost" data-act="pick-file" data-id="${block.id}">파일 선택</button>`
        }
      </div>
      ${commentUi(block)}
    </div>`;
  }
  let mark = "";
  if (block.type === "checklist") {
    mark = `<button class="note-check ${block.checked ? "done" : ""}" data-act="check-block" data-id="${block.id}" aria-label="완료">${block.checked ? icon("check", 12) : ""}</button>`;
  } else if (block.type === "bullet") {
    mark = `<span class="note-bullet">•</span>`;
  } else if (block.type === "numbered") {
    mark = `<span class="note-num">${numberedLabel(blocks, index)}</span>`;
  } else if (block.type === "toggle") {
    mark = `<button class="note-toggle" data-act="toggle-block" data-id="${block.id}">${icon(block.open ? "chevronDown" : "chevronRight", 16)}</button>`;
  }
  return `<div class="block note-block ${block.checked ? "checked" : ""} ${block.comments?.length ? "has-comments" : ""}" data-block="${block.id}" style="padding-left:${pad}px">
    ${mark}
    <div class="${blockClass(block.type)}" contenteditable="true" data-act="block" data-id="${block.id}" data-type="${block.type}"${blockTextStyle(block) ? ` style="${blockTextStyle(block)}"` : ""}>${decorateNoteHtml(block.text || "")}</div>
    ${commentUi(block)}
  </div>`;
}

function selectedBlock() {
  const page = store.projectById(currentPageId());
  if (!page || isFolderItem(page)) return null;
  return (page.blocks || []).find((block) => block.id === ui.selectedBlockId) || page.blocks?.[0] || null;
}

function blockFontSize(block) {
  if (block?.fontSize) return Number(block.fontSize);
  if (block?.type === "heading") return 26;
  if (block?.type === "subheading") return 20;
  if (block?.type === "code") return 14;
  return 17;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function fileKind(mime, name) {
  const type = String(mime || "");
  const ext = String(name || "").split(".").pop()?.toUpperCase() || "";
  if (type.startsWith("image/")) return "이미지";
  if (type.includes("pdf") || ext === "PDF") return "PDF";
  if (type.includes("word") || ["DOC", "DOCX"].includes(ext)) return "문서";
  if (type.includes("sheet") || ["XLS", "XLSX", "CSV"].includes(ext)) return "스프레드시트";
  if (type.includes("presentation") || ["PPT", "PPTX"].includes(ext)) return "슬라이드";
  if (type.startsWith("text/") || ["TXT", "MD"].includes(ext)) return "텍스트";
  if (type.startsWith("audio/")) return "오디오";
  if (type.startsWith("video/")) return "비디오";
  return ext && ext.length <= 5 ? ext : "파일";
}

function noteFontOptions() {
  const fonts = NOTE_FONTS.map((item) => ({ ...item }));
  const custom = store.getState().settings?.customFont;
  if (custom?.name) {
    fonts.push({ id: custom.name, css: `"${CUSTOM_FONT_NAME}", sans-serif` });
  }
  return fonts;
}

function fontCss(id) {
  if (!id) return "";
  return noteFontOptions().find((item) => item.id === id)?.css || "";
}

function noteToolbar() {
  const current = selectedBlock();
  const type = current?.type || "paragraph";
  const size = blockFontSize(current);
  const styleValue = NOTE_PARA_STYLES.some((item) => item.type === type) ? type : "paragraph";
  const fontValue = current?.fontFamily && noteFontOptions().some((item) => item.id === current.fontFamily)
    ? current.fontFamily
    : "Pretendard";
  const lineValue = NOTE_LINE_HEIGHTS.includes(Number(current?.lineHeight)) ? String(current.lineHeight) : "";
  const fonts = noteFontOptions();
  return `
    <div class="note-chrome">
    <div class="note-bar note-ribbon" data-note-chrome data-note-bar>
      <button type="button" data-act="note-undo" title="실행취소">${icon("undo", 18)}</button>
      <button type="button" data-act="note-redo" title="다시실행">${icon("redo", 18)}</button>
      <span class="note-bar-sep" aria-hidden="true"></span>
      <select class="note-bar-select" data-act="note-style-select" title="문단 스타일" aria-label="문단 스타일">
        ${NOTE_PARA_STYLES.map(
          (item) =>
            `<option value="${item.type}" ${item.type === styleValue ? "selected" : ""}>${escapeHtml(item.label)}</option>`,
        ).join("")}
      </select>
      <span class="note-bar-sep" aria-hidden="true"></span>
      <button type="button" data-act="note-mark" data-cmd="bold" title="굵게">${icon("bold", 16)}</button>
      <button type="button" data-act="note-mark" data-cmd="italic" title="기울임">${icon("italic", 16)}</button>
      <button type="button" class="${type === "checklist" ? "on" : ""}" data-act="note-check" title="체크리스트">${icon("checklist", 18)}</button>
      <button type="button" class="${type === "bullet" ? "on" : ""}" data-act="note-style" data-type="bullet" title="글머리 기호">${icon("list", 18)}</button>
      <button type="button" class="${type === "numbered" ? "on" : ""}" data-act="note-style" data-type="numbered" title="번호 목록">1.</button>
      <div class="note-more-wrap">
        <button type="button" class="${ui.noteMoreOpen ? "on" : ""}" data-act="note-more-toggle" title="더보기" aria-expanded="${ui.noteMoreOpen ? "true" : "false"}">${icon("moreHorizontal", 18)}</button>
        <div class="note-more-pop ${ui.noteMoreOpen ? "open" : ""}">
          <button type="button" class="${ui.findOpen ? "on" : ""}" data-act="note-find" title="찾기">${icon("search", 18)}</button>
          <select class="note-bar-select note-bar-font" data-act="note-font-select" title="글꼴" aria-label="글꼴">
            ${fonts
              .map(
                (item) =>
                  `<option value="${escapeHtml(item.id)}" ${item.id === fontValue ? "selected" : ""}>${escapeHtml(item.id)}</option>`,
              )
              .join("")}
          </select>
          <span class="note-size-inline">
            <button type="button" data-act="note-size-bump" data-delta="-2" title="작게">A−</button>
            <input class="note-size-input" data-act="note-size-input" type="number" min="12" max="42" value="${size}" aria-label="글자 크기">
            <button type="button" data-act="note-size-bump" data-delta="2" title="크게">A+</button>
          </span>
          <button type="button" data-act="note-mark" data-cmd="underline" title="밑줄">${icon("underline", 16)}</button>
          <button type="button" data-act="note-mark" data-cmd="strikeThrough" title="취소선">${icon("strike", 16)}</button>
          <div class="note-color-wrap">
            <button type="button" class="${ui.colorOpen ? "on" : ""}" data-act="note-color-toggle" title="글자 색">${icon("textColor", 16)}</button>
            <div class="note-color-pop ${ui.colorOpen ? "open" : ""}">
              ${NOTE_COLORS.map(
                (color) =>
                  `<button type="button" data-act="note-color" data-color="${color}" style="background:${color}" title="${color}" aria-label="${color}"></button>`,
              ).join("")}
            </div>
          </div>
          <div class="note-color-wrap">
            <button type="button" class="${ui.highlightOpen ? "on" : ""}" data-act="note-highlight-toggle" title="하이라이트">${icon("highlighter", 16)}</button>
            <div class="note-color-pop note-highlight-pop ${ui.highlightOpen ? "open" : ""}">
              ${NOTE_HIGHLIGHTS.map(
                (item) =>
                  `<button type="button" data-act="note-highlight" data-color="${item.color}" style="background:${item.color === "transparent" ? "var(--paper)" : item.color}" title="${item.label}" aria-label="${item.label}"></button>`,
              ).join("")}
            </div>
          </div>
          <button type="button" data-act="note-link" title="링크">${icon("link", 18)}</button>
          <button type="button" data-act="note-photo" title="이미지 삽입">${icon("camera", 18)}</button>
          <button type="button" data-act="note-pdf" title="PDF 삽입">${icon("pdf", 18)}</button>
          <button type="button" data-act="note-mark" data-cmd="justifyLeft" title="왼쪽 정렬">${icon("alignLeft", 16)}</button>
          <button type="button" data-act="note-mark" data-cmd="justifyCenter" title="가운데 정렬">${icon("alignCenter", 16)}</button>
          <button type="button" data-act="note-mark" data-cmd="justifyRight" title="오른쪽 정렬">${icon("alignRight", 16)}</button>
          <select class="note-bar-select" data-act="note-line-height" title="줄 간격" aria-label="줄 간격">
            <option value="" ${lineValue ? "" : "selected"} disabled>줄 간격</option>
            ${NOTE_LINE_HEIGHTS.map(
              (value) =>
                `<option value="${value}" ${String(value) === lineValue ? "selected" : ""}>${value}</option>`,
            ).join("")}
          </select>
          <button type="button" data-act="note-outdent" title="내어쓰기">${icon("outdent", 18)}</button>
          <button type="button" data-act="note-indent" title="들여쓰기">${icon("indent", 18)}</button>
          <button type="button" data-act="note-clear-format" title="서식 지우기">${icon("removeFormat", 16)}</button>
          <button type="button" class="${type === "table" ? "on" : ""}" data-act="note-table" title="표">${icon("table", 18)}</button>
          <button type="button" data-act="note-file" title="파일">${icon("paperclip", 18)}</button>
          <div class="note-color-wrap">
            <button type="button" class="${ui.emojiOpen ? "on" : ""}" data-act="note-emoji-toggle" title="이모지">${icon("emoji", 18)}</button>
            <div class="note-emoji-pop ${ui.emojiOpen ? "open" : ""}">
              ${NOTE_EMOJIS.map((emo) => `<button type="button" data-act="note-emoji" data-emoji="${emo}">${emo}</button>`).join("")}
            </div>
          </div>
          <button type="button" data-act="note-date" title="날짜 삽입">${icon("calendar", 18)}</button>
          <button type="button" data-act="note-toc" title="목차 삽입">${icon("toc", 18)}</button>
          <button type="button" class="${ui.pastePlain ? "on" : ""}" data-act="note-paste-plain" title="서식 없이 붙여넣기">Aa</button>
        </div>
      </div>
    </div>
    </div>`;
}

function docTabsRailHtml(page) {
  const tabs = page.tabs || [];
  const collapsed = Boolean(ui.docTabsCollapsed);
  const back = page.parentId
    ? `data-act="open-page" data-id="${page.parentId}"`
    : `data-act="open-projects-root"`;
  return `<aside class="doc-tabs-rail ${collapsed ? "collapsed" : ""}">
    <div class="doc-tabs-tools">
      <button type="button" class="doc-tabs-back" ${back} aria-label="뒤로">${icon("chevronLeft", 18)}</button>
      <button type="button" class="doc-tabs-toggle" data-act="toggle-doc-tabs" aria-label="${collapsed ? "문서 탭 펼치기" : "문서 탭 접기"}" title="${collapsed ? "펼치기" : "접기"}">${icon(collapsed ? "chevronRight" : "chevronLeft", 18)}</button>
    </div>
    <div class="doc-tabs-head">
      <span>문서 탭</span>
      <button type="button" class="icon-btn" data-act="add-doc-tab" data-id="${page.id}" aria-label="탭 추가">${icon("plus", 16)}</button>
    </div>
    <ul class="doc-tabs-list">
      ${tabs
        .map((tab) => {
          const on = tab.id === page.activeTabId;
          const menu = ui.docTabMenu === tab.id;
          const renaming = ui.renamingTabId === tab.id;
          return `<li class="doc-tab ${on ? "on" : ""}">
            ${
              renaming
                ? `<input class="doc-tab-rename" data-act="rename-doc-tab" data-id="${page.id}" data-tab="${tab.id}" value="${escapeHtml(tab.name)}" maxlength="40">`
                : `<button type="button" class="doc-tab-btn" data-act="set-doc-tab" data-id="${page.id}" data-tab="${tab.id}">
                    <span class="doc-tab-ico">${icon("page", 16)}</span>
                    <span class="doc-tab-name">${escapeHtml(tab.name)}</span>
                  </button>`
            }
            <button type="button" class="doc-tab-more" data-act="doc-tab-menu" data-id="${page.id}" data-tab="${tab.id}" aria-label="탭 메뉴">${icon("moreVertical", 14)}</button>
            ${
              menu
                ? `<div class="doc-tab-flyout">
                    <button type="button" data-act="start-rename-doc-tab" data-tab="${tab.id}">이름 변경</button>
                    <button type="button" data-act="del-doc-tab" data-id="${page.id}" data-tab="${tab.id}" ${tabs.length <= 1 ? "disabled" : ""}>삭제</button>
                  </div>`
                : ""
            }
          </li>`;
        })
        .join("")}
    </ul>
  </aside>`;
}

function switchDocTab(pageId, tabId) {
  ui.selectedBlockId = null;
  ui.commentBlockId = null;
  ui.findIndex = 0;
  ui.docTabMenu = null;
  ui.renamingTabId = null;
  ui.colorOpen = false;
  ui.highlightOpen = false;
  ui.emojiOpen = false;
  store.setActiveTab(pageId, tabId);
}

function placeNotePop(pop, anchor) {
  if (!pop || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const width = pop.offsetWidth || 220;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
  pop.style.top = `${r.bottom + 6}px`;
}

function noteCrumbsHtml(page, scope) {
  const crumbs = page ? pageAncestors(page) : [];
  const parts = [
    `<button type="button" class="folder-crumb ${page ? "" : "on"}" data-act="open-projects-root">홈</button>`,
  ];
  crumbs.forEach((item, index) => {
    const last = index === crumbs.length - 1;
    parts.push(`<span class="folder-crumb-sep" aria-hidden="true">/</span>`);
    parts.push(
      last
        ? `<span class="folder-crumb on">${escapeHtml(item.name || "제목 없음")}</span>`
        : `<button type="button" class="folder-crumb" data-act="open-page" data-id="${item.id}">${escapeHtml(item.name || "제목 없음")}</button>`,
    );
  });
  return `<nav class="folder-crumbs" aria-label="위치">${parts.join("")}</nav>`;
}

function folderCardsHtml(parentId, scope) {
  const kids = [...store.childPages(parentId, scope)].sort((a, b) => {
    const af = isFolderItem(a) ? 0 : 1;
    const bf = isFolderItem(b) ? 0 : 1;
    if (af !== bf) return af - bf;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  if (!kids.length) {
    return `<div class="folder-empty">${parentId ? "이 폴더가 비어 있습니다." : "아직 폴더나 페이지가 없습니다."} 새 폴더나 새 페이지를 만들어 보세요.</div>`;
  }
  return `<div class="folder-grid">
    ${kids
      .map((item) => {
        const folder = isFolderItem(item);
        const mark = folderItemMark(item);
        const nested = store.childPages(item.id, scope).length;
        const meta = folder
          ? nested
            ? `${nested}개 항목`
            : "빈 폴더"
          : isPdfItem(item)
            ? `PDF · ${noteListWhen(item.updatedAt)}`
            : noteListWhen(item.updatedAt);
        return `<div class="folder-card-item">
          <button type="button" class="folder-card" data-act="open-page" data-id="${item.id}">
            <span class="folder-card-ico ${mark.klass}">${icon(mark.name, 28)}</span>
            <span class="folder-card-name">${escapeHtml(item.name || "제목 없음")}</span>
            <span class="folder-card-meta">${escapeHtml(meta)}</span>
          </button>
          <button type="button" class="icon-btn folder-card-del" data-act="del-page" data-id="${item.id}" aria-label="${folder ? "폴더 삭제" : "페이지 삭제"}">${icon("trash", 14)}</button>
        </div>`;
      })
      .join("")}
  </div>`;
}

function folderPaneHtml(page, scope, parentAttr) {
  const parent = parentAttr ? `data-parent="${parentAttr}"` : "";
  const group = scope ? `data-group="${scope}"` : "";
  return `
    <div class="folder-pane">
      ${noteCrumbsHtml(page, scope)}
      ${
        page
          ? `<div class="folder-head">
              <input class="page-name folder-name" data-act="rename-page" data-id="${page.id}" value="${escapeHtml(page.name)}" placeholder="폴더 이름">
              <button class="icon-btn" data-act="del-page" data-id="${page.id}" aria-label="폴더 삭제">${icon("trash", 16)}</button>
            </div>`
          : ""
      }
      <label class="note-search">${icon("search", 14)}<input data-act="note-query" value="${escapeHtml(ui.noteQuery)}" placeholder="폴더와 페이지 검색"></label>
      <div class="folder-actions">
        <button class="ghost" data-act="new-folder" ${parent} ${group}>${icon("folder", 14)} 새 폴더</button>
        <button class="primary" data-act="new-page" ${parent} ${group}>${icon("plus", 14)} 새 페이지</button>
      </div>
      <div data-folder-body>${folderBodyHtml(page, scope)}</div>
    </div>`;
}

const PDF_INK_COLORS = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#ca8a04"];
const PDF_INK_WIDTHS = [2, 3.5, 6];

function pdfViewerHtml(page, scope) {
  const n = Math.max(1, Number(page.pdfPage) || 1);
  const zoom = Math.round((Number(ui.pdfZoom) || 1) * 100);
  const ink = ui.pdfInk || { mode: "off", color: "#111827", width: 3.5 };
  const notesOpen = Boolean(ui.pdfNotesOpen);
  return `
    <div class="pdf-view ${notesOpen ? "notes-open" : ""}">
      ${noteCrumbsHtml(page, scope)}
      <div class="folder-head pdf-head">
        <input class="page-name folder-name" data-act="rename-page" data-id="${page.id}" value="${escapeHtml(page.name)}" placeholder="제목">
        <button type="button" class="ghost pdf-notes-toggle ${notesOpen ? "on" : ""}" data-act="toggle-pdf-notes" aria-expanded="${notesOpen ? "true" : "false"}" aria-controls="pdf-notes-panel">${icon("comment", 16)} 메모</button>
      </div>
      <div class="pdf-workspace ${notesOpen ? "notes-open" : ""}">
      <div class="pdf-viewer ${ink.mode !== "off" ? "inking" : ""}" data-pdf-viewer data-id="${page.id}">
        <aside class="pdf-thumbs" data-pdf-thumbs aria-label="페이지 목록"></aside>
        <section class="pdf-stage">
          <div class="pdf-tools">
            <button type="button" class="icon-btn" data-act="pdf-prev" aria-label="이전 페이지">${icon("chevronLeft", 16)}</button>
            <label class="pdf-page-field">
              <input class="field pdf-page-input" data-act="pdf-page-input" type="number" min="1" value="${n}" aria-label="페이지 번호">
              <span data-pdf-total>/ 1</span>
            </label>
            <button type="button" class="icon-btn" data-act="pdf-next" aria-label="다음 페이지">${icon("chevronRight", 16)}</button>
            <span class="pdf-tools-gap"></span>
            <button type="button" class="ghost" data-act="pdf-zoom-out" aria-label="축소">${icon("minus", 14)}</button>
            <span data-pdf-zoom>${zoom}%</span>
            <button type="button" class="ghost" data-act="pdf-zoom-in" aria-label="확대">${icon("plus", 14)}</button>
            <span class="pdf-tools-gap"></span>
            <button type="button" class="ghost ${ink.mode === "pen" ? "on" : ""}" data-act="pdf-ink" aria-label="펜">${icon("pencil", 14)}</button>
            <button type="button" class="ghost ${ink.mode === "text" ? "on" : ""}" data-act="pdf-ink-text" aria-label="텍스트">${icon("aa", 14)}</button>
            <button type="button" class="ghost ${ink.mode === "erase" ? "on" : ""}" data-act="pdf-ink-erase" aria-label="지우개">${icon("eraser", 14)}</button>
            <span class="pdf-ink-colors" role="group" aria-label="펜 색">
              ${PDF_INK_COLORS.map(
                (color) =>
                  `<button type="button" class="pdf-ink-swatch ${ink.color.toLowerCase() === color ? "on" : ""}" data-act="pdf-ink-color" data-color="${color}" style="background:${color}" aria-label="색 ${color}"></button>`,
              ).join("")}
            </span>
            <span class="pdf-ink-widths" role="group" aria-label="펜 굵기">
              ${PDF_INK_WIDTHS.map(
                (width) =>
                  `<button type="button" class="pdf-ink-width ${Number(ink.width) === width ? "on" : ""}" data-act="pdf-ink-width" data-width="${width}" aria-label="굵기 ${width}">
                    <i style="width:${4 + width}px;height:${4 + width}px"></i>
                  </button>`,
              ).join("")}
            </span>
          </div>
          <div class="pdf-main" data-pdf-main>
            <div class="pdf-page" data-pdf-page>
              <canvas data-pdf-canvas></canvas>
              <canvas data-pdf-ink></canvas>
              <div class="pdf-texts" data-pdf-texts></div>
            </div>
          </div>
          <div class="pdf-fallback" data-pdf-fallback hidden>
            <iframe title="${escapeHtml(page.pdfName || page.name || "PDF")}"></iframe>
          </div>
        </section>
      </div>
      <aside class="pdf-notes" data-pdf-notes id="pdf-notes-panel" ${notesOpen ? "" : "hidden"}>
        <div class="pdf-notes-head">
          <b>메모</b>
          <span>이 PDF에 대한 정리 · 필기와는 별도입니다</span>
        </div>
        <textarea class="field pdf-notes-input" data-act="pdf-notes" data-id="${page.id}" placeholder="요약, 질문, 할 말을 적어 두세요">${escapeHtml(page.pdfNotes || "")}</textarea>
      </aside>
      </div>
    </div>`;
}

function projectPageExtras(page, { parentAttr = "", groupId = "" } = {}) {
  const parentBtn = parentAttr ? `data-parent="${parentAttr}"` : "";
  const gid = groupId || page?.groupId || "";
  const groupBtn = gid ? `data-group="${gid}"` : "";
  return `${
    page?.groupId
      ? `<button class="ghost" data-act="meet-ai" data-id="${page.id}">${icon("sparkle", 14)} AI로 정리</button>`
      : ""
  }<button class="ghost" data-act="new-folder" ${parentBtn} ${groupBtn}>새 폴더</button><button class="primary" data-act="new-page" ${parentBtn} ${groupBtn}>${icon("plus", 14)} 새 페이지</button>`;
}

function projectWorkspaceHtml(page, { desk = false, scope = null, showTop = true } = {}) {
  ui.notePageId = page?.id || null;
  resetNoteHistory(page?.id || null, page?.activeTabId || null);
  const parentAttr = creationParentId(page) || "";
  const extras = projectPageExtras(page, { parentAttr, groupId: scope || "" });
  const browsingFolder = !page || isFolderItem(page);
  const projectTop = (sub) => (desk || !showTop ? "" : top("프로젝트", sub, extras, { titleAct: "open-projects-root" }));
  if (browsingFolder) {
    return `
    ${projectTop("폴더에 페이지를 모아 둡니다.")}
    ${folderPaneHtml(page, scope, parentAttr)}`;
  }
  if (isPdfItem(page)) {
    return `
    ${projectTop("PDF를 페이지로 열람합니다.")}
    ${pdfViewerHtml(page, scope)}`;
  }
  const blocks = page.blocks || [];
  return `
    ${projectTop("체크리스트 · 서식 · 표 · 파일")}
    <div class="ws notes editing ${ui.docTabsCollapsed ? "rail-collapsed" : ""}">
      ${docTabsRailHtml(page)}
      <div class="note-pane">
        ${noteCrumbsHtml(page, scope)}
        ${noteToolbar()}
        ${findBarHtml()}
        <div class="editor note-editor note-doc">
          <div class="note-head">
            <input class="page-name" data-act="rename-page" data-id="${page.id}" value="${escapeHtml(page.name)}" placeholder="제목">
          </div>
          <div class="note-stamp">${noteStamp(page.updatedAt || page.createdAt)}</div>
          ${blocks.map((block, i) => renderBlock(block, i, blocks)).join("")}
        </div>
      </div>
    </div>`;
}

function viewProjects(pageId) {
  const pages = store.getState().projects;
  const route = parseHash();
  const desk = route.name === "focus";
  const atPersonalRoot = route.name === "projects" && !pageId;
  let page = pageId ? pages.find((item) => item.id === pageId) : null;
  if (atPersonalRoot) page = null;
  else if (!page && desk) page = pages.find((item) => item.id === ui.notePageId && !item.groupId) || null;
  else if (!page) page = pages.find((item) => item.id === ui.notePageId && !item.groupId) || null;
  if (page?.groupId) page = null;
  return projectWorkspaceHtml(page, { desk, scope: null, showTop: true });
}

function viewGroups(groupId) {
  ensureRemoteProfiles();
  const s = store.getState();
  const uid = auth.user()?.id;
  const mine = s.groups.filter((group) => uid && (group.memberIds || []).includes(uid));
  const group = mine.find((item) => item.id === groupId);
  if (!group) {
    return `
      ${top("팀플", "팀플 그룹 · 초대 코드로 최대 8명", `<button class="ghost" data-act="join-group">참여</button><button class="primary" data-act="new-group">그룹 만들기</button>`)}
      <div class="list">
        ${
          mine.length
            ? mine
                .map(
                  (item) =>
                    `<a class="task" href="#/groups/${item.id}"><span class="page-glyph" style="background:#2563eb">${icon("users", 12)}</span><div><div class="task-title">${escapeHtml(item.name)}</div><div class="task-meta">코드 ${item.inviteCode} · ${item.memberIds.length}명</div></div></a>`,
                )
                .join("")
            : `<div class="empty">아직 팀플 그룹이 없습니다.</div>`
        }
      </div>`;
  }
  const ctx = groupRoute();
  const tab = ctx?.groupId === group.id && GROUP_TABS.includes(ctx.tab) ? ctx.tab : "tasks";
  ui.groupTab = tab;
  const pageId = tab === "projects" ? ctx?.pageId || "" : "";
  const projectPage = pageId ? store.projectById(pageId) : null;
  const scopedPage = inheritedGroupId(projectPage) === group.id ? projectPage : null;
  const parentAttr = creationParentId(scopedPage) || "";
  const extras = `${
    tab === "projects" ? projectPageExtras(scopedPage, { parentAttr, groupId: group.id }) : ""
  }<button class="ghost" data-act="leave-group" data-id="${group.id}">나가기</button>`;
  return `
    ${top(group.name, `팀플 그룹 · 초대 코드 ${group.inviteCode}`, extras)}
    <div class="gpa-tabs">
      <button type="button" class="gpa-tab ${tab === "tasks" ? "on" : ""}" data-act="group-tab" data-tab="tasks" data-group="${group.id}">할 일</button>
      <button type="button" class="gpa-tab ${tab === "projects" ? "on" : ""}" data-act="group-tab" data-tab="projects" data-group="${group.id}">프로젝트</button>
      <button type="button" class="gpa-tab ${tab === "schedule" ? "on" : ""}" data-act="group-tab" data-tab="schedule" data-group="${group.id}">일정</button>
    </div>
    ${tab === "projects" ? viewGroupProjects(group, scopedPage) : tab === "schedule" ? viewGroupSchedule(group) : viewGroupTasks(group)}`;
}

function viewGroupTasks(group) {
  const tasks = store.tasksInGroup(group.id);
  const assignees = assigneeChoices(group);
  return `
    <p class="page-date">담당자의 오늘 할 일에 마감일까지 보입니다. 완료하거나 마감이 지나면 사라집니다.</p>
    <form class="gpa-form group-task-form" data-act="add-group-task">
      <input type="hidden" name="groupId" value="${group.id}">
      <input class="field" name="title" placeholder="할 일 제목" required>
      <select class="field" name="assigneeName" aria-label="담당자">
        ${assignees.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
      </select>
      <label class="due-field">마감일
        <input class="field" name="dueDate" type="date" value="${todayKey()}" required>
      </label>
      <button class="primary" type="submit">할 일 추가</button>
    </form>
    <div class="list">
      ${tasks.length ? tasks.map((task) => taskRow(task)).join("") : `<div class="empty">아직 팀 할 일이 없습니다.</div>`}
    </div>`;
}

function viewGroupProjects(group, page) {
  return projectWorkspaceHtml(page || null, { desk: false, scope: group.id, showTop: false });
}

function viewGroupSchedule(group) {
  if (!auth.user()) {
    return `<div class="empty">일정 조율은 로그인 후 이용할 수 있어요. <button class="ghost" type="button" data-act="auth">로그인</button></div>`;
  }
  const uid = auth.user().id;
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
  if (!memberIds.includes(uid) && !memberIds.includes(store.getState().currentMemberId)) {
    return `<div class="empty">그룹 멤버만 일정 조율을 볼 수 있어요.</div>`;
  }
  const members = memberIds.map((memberId) => {
    const profile = remoteProfiles.find((item) => item.userId === memberId);
    return { id: memberId, name: memberLabel(memberId), shared: isBusyShared(profile), count: profile?.busySlots?.length || 0 };
  });
  const shared = members.filter((item) => item.shared);
  const polls = remotePolls.filter((poll) => poll.groupId === group.id);
  const avail = ui.availGroupId === group.id ? ui.availResult : null;
  return `
    <section class="sched-panel">
      <div class="sched-head">
        <b>AI로 가능한 시간 찾기</b>
        <span>공개된 시간표의 바쁜 시간만 모아서 빈 시간을 찾습니다</span>
      </div>
      ${
        shared.length
          ? `<div class="list">
              ${members
                .map(
                  (item) =>
                    `<div class="task"><div><div class="task-title">${escapeHtml(item.name)}</div><div class="task-meta">${item.shared ? `바쁜 시간 ${item.count}개 공개` : "시간표 비공개"}</div></div></div>`,
                )
                .join("")}
            </div>
            <form class="gpa-form sched-avail-form" data-act="find-availability">
              <input type="hidden" name="groupId" value="${group.id}">
              <label class="due-field">기간 시작<input class="field" name="fromDate" type="date" value="${todayKey()}"></label>
              <label class="due-field">기간 끝<input class="field" name="toDate" type="date" value="${formatDateKey(addDays(new Date(), 6))}"></label>
              <input class="field" name="rangeStart" type="time" value="09:00" aria-label="시작 시간">
              <input class="field" name="rangeEnd" type="time" value="22:00" aria-label="종료 시간">
              <button class="primary" type="submit" ${ui.availLoading ? "disabled" : ""}>${ui.availLoading ? "찾는 중..." : "찾기"}</button>
            </form>
            ${
              avail
                ? `<p class="page-date">${escapeHtml(avail.summary || "")}</p>
                   <div class="list">${
                     (avail.suggestions || []).length
                       ? avail.suggestions
                           .map(
                             (item) =>
                               `<div class="task"><div><div class="task-title">${escapeHtml(item.label || `${item.start || ""}–${item.end || ""}`)}</div><div class="task-meta">${item.availableCount != null ? `${item.availableCount}명 가능` : ""}</div></div></div>`,
                           )
                           .join("")
                       : `<div class="empty">추천할 빈 시간이 없습니다.</div>`
                   }</div>`
                : ""
            }`
          : `<div class="empty">그룹원들이 설정에서 시간표를 공개하면 이용할 수 있어요</div>`
      }
    </section>
    <section class="sched-panel">
      <div class="sched-head">
        <b>약속 잡기</b>
        <span>가능한 30분 칸을 눌러 표시하세요. 많이 겹칠수록 칸이 진해집니다.</span>
      </div>
      <button type="button" class="primary" data-act="open-poll" data-id="${group.id}">${polls.length ? "새 약속 잡기" : "약속 잡기 만들기"}</button>
      ${polls.length ? polls.map((poll) => viewPollGrid(poll, group)).join("") : `<div class="empty">아직 만든 약속 조율이 없습니다.</div>`}
    </section>`;
}

function viewPollGrid(poll, group) {
  const dates = Array.isArray(poll.dates) ? poll.dates : [];
  const times = halfHourKeys(poll.startTime || "09:00", poll.endTime || "22:00");
  const rows = pollResponsesFor(poll);
  const memberCount = Math.max(1, (group.memberIds || []).length);
  const uid = auth.user()?.id;
  const hover = ui.pollHover?.pollId === poll.id ? ui.pollHover.slot : "";
  const hoverNames = hover
    ? rows.filter((row) => (row.slots || []).includes(hover)).map((row) => memberLabel(row.userId))
    : [];
  return `
    <article class="poll-card" data-poll-card="${poll.id}">
      <div class="sched-head poll-card-head">
        <div>
          <b>${escapeHtml(poll.title || "약속 잡기")}</b>
          <span>${escapeHtml(poll.startTime || "09:00")}–${escapeHtml(poll.endTime || "22:00")}</span>
        </div>
        <div class="poll-card-more">
          <button type="button" class="icon-btn ${ui.pollMenu === poll.id ? "on" : ""}" data-act="poll-menu" data-id="${poll.id}" title="약속 편집" aria-label="약속 편집" aria-expanded="${ui.pollMenu === poll.id ? "true" : "false"}">${icon("moreVertical", 16)}</button>
          ${
            ui.pollMenu === poll.id
              ? `<div class="poll-card-pop">
                  <button type="button" data-act="rename-poll" data-id="${poll.id}">이름 수정</button>
                  <button type="button" class="danger-text" data-act="del-poll" data-id="${poll.id}">삭제</button>
                </div>`
              : ""
          }
        </div>
      </div>
      <div class="poll-grid-wrap">
        <div class="poll-grid" style="--poll-cols:${dates.length}">
          <div class="poll-time"></div>
          ${dates.map((date) => `<div class="poll-day">${escapeHtml(pollDateLabel(date))}</div>`).join("")}
          ${times
            .map(
              (time) =>
                `<div class="poll-time">${time}</div>` +
                dates
                  .map((date) => {
                    const key = `${date}-${time}`;
                    const count = rows.filter((row) => (row.slots || []).includes(key)).length;
                    const mine = Boolean(uid && rows.some((row) => row.userId === uid && (row.slots || []).includes(key)));
                    const ratio = count / memberCount;
                    return `<button type="button" class="poll-cell ${mine ? "mine" : ""} ${ui.pollHover?.slot === key && ui.pollHover?.pollId === poll.id ? "tip" : ""}" style="--hit:${ratio}" data-act="toggle-poll-slot" data-poll="${poll.id}" data-slot="${key}" aria-pressed="${mine ? "true" : "false"}" aria-label="${escapeHtml(pollDateLabel(date))} ${time}"></button>`;
                  })
                  .join(""),
            )
            .join("")}
        </div>
      </div>
      <p class="poll-hint">${hoverNames.length ? `${escapeHtml(hover)} · ${hoverNames.map(escapeHtml).join(", ")}` : "칸을 누르거나 올리면 가능한 멤버가 보여요"}</p>
    </article>`;
}

function viewCategories() {
  const cats = store.getState().categories;
  const locked = new Set(["school", "work", "personal", "exercise"]);
  return `
    ${top("카테고리", "할 일 분류")}
    <div class="list">
      ${cats
        .map((cat) => {
          if (ui.editCategoryId === cat.id) {
            return `
              <form class="cat-edit" data-act="save-cat">
                <input type="hidden" name="id" value="${cat.id}">
                <input class="field" name="name" value="${escapeHtml(cat.name)}" required>
                <input class="field cat-color" name="color" type="color" value="${escapeHtml(cat.color || "#2563eb")}">
                <button class="primary" type="submit">저장</button>
                <button class="ghost" type="button" data-act="cancel-edit-cat">취소</button>
              </form>`;
          }
          return `<div class="task"><span class="dot" style="background:${cat.color}"></span><div class="task-title">${escapeHtml(cat.name)}</div>
            <button class="ghost" data-act="edit-cat" data-id="${cat.id}">수정</button>
            ${locked.has(cat.id) ? "" : `<button class="icon-btn" data-act="del-cat" data-id="${cat.id}">${icon("trash", 14)}</button>`}</div>`;
        })
        .join("")}
    </div>
    <form class="composer" data-act="add-cat">
      <input class="field" name="name" placeholder="새 카테고리" required>
      <button class="primary" type="submit">추가</button>
    </form>`;
}

function profileInitial(name) {
  const text = String(name || "").trim();
  return text ? text[0] : "?";
}

function applyProfilePhoto(file) {
  if (!file || !String(file.type || "").startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const size = 240;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const side = Math.min(image.width, image.height);
      const sx = (image.width - side) / 2;
      const sy = (image.height - side) / 2;
      ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      const photoUrl = canvas.toDataURL("image/jpeg", 0.8);
      store.updateProfile({ photoUrl });
      const avatar = document.querySelector("[data-profile-avatar]");
      if (avatar) avatar.innerHTML = `<img src="${photoUrl}" alt="">`;
    };
    image.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
}

function viewProfile() {
  const profile = store.getState().profile || {};
  const nick = profile.nickname || "";
  const bio = profile.bio || "";
  const photoUrl = profile.photoUrl || "";
  const account = auth.user()?.email || "로그인이 필요합니다";
  return `
    <div class="profile-page">
      <form class="profile-card" data-act="save-profile">
        <h1 class="profile-title">${ui.onboarding ? "프로필 설정" : "프로필"}</h1>
        ${ui.onboarding ? `<p class="page-date">이름을 저장하면 오늘 할 일로 이동합니다.</p>` : ""}
        <div class="profile-avatar" data-profile-avatar>
          ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="">` : `<span>${escapeHtml(profileInitial(nick))}</span>`}
        </div>
        <div class="profile-photo-actions">
          <label class="ghost profile-file-btn">사진 선택
            <input type="file" accept="image/*" data-act="profile-photo">
          </label>
          <label class="ghost profile-file-btn">사진 촬영
            <input type="file" accept="image/*" capture="user" data-act="profile-photo">
          </label>
        </div>
        <label>이름
          <input class="field" name="nickname" value="${escapeHtml(nick)}" placeholder="이름" maxlength="24" required>
        </label>
        <label>자기소개
          <textarea class="field" name="bio" placeholder="간단한 자기소개를 적어보세요" maxlength="150">${escapeHtml(bio)}</textarea>
        </label>
        <label>아이디
          <input class="field" value="${escapeHtml(account)}" readonly>
        </label>
        <button class="primary" type="submit">${ui.onboarding ? "시작하기" : "저장"}</button>
      </form>
      ${ui.onboarding ? "" : personalFocusCard()}
    </div>`;
}

const THEME_PRESETS = [
  { color: "#2563eb", soft: "#eff4ff", label: "블루" },
  { color: "#16a34a", soft: "#ecfdf3", label: "그린" },
  { color: "#7c3aed", soft: "#f5f3ff", label: "퍼플" },
  { color: "#db2777", soft: "#fdf2f8", label: "핑크" },
  { color: "#ea580c", soft: "#fff7ed", label: "오렌지" },
  { color: "#0d9488", soft: "#f0fdfa", label: "틸" },
  { color: "#dc2626", soft: "#fef2f2", label: "레드" },
  { color: "#d97706", soft: "#fffbeb", label: "앰버" },
  { color: "#4f46e5", soft: "#eef2ff", label: "인디고" },
  { color: "#475569", soft: "#f1f5f9", label: "슬레이트" },
];

const SCHOOL_THEME_PRESETS = [
  { id: "snu", name: "서울대", initial: "서", color: "#0f0f70" },
  { id: "yonsei", name: "연세대", initial: "연", color: "#003876" },
  { id: "korea", name: "고려대", initial: "고", color: "#8b0029" },
  { id: "skku", name: "성균관대", initial: "성", color: "#003e74" },
  { id: "hanyang", name: "한양대", initial: "한", color: "#0e4a84" },
  { id: "sogang", name: "서강대", initial: "서강", color: "#b60005" },
  { id: "ewha", name: "이화여대", initial: "이", color: "#00643e" },
];

function themeHex(value, fallback = "#2563eb") {
  const hex = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : fallback;
}

function themeModeValue(value) {
  return ["light", "dark", "system"].includes(value) ? value : "system";
}

function resolvedDark(mode) {
  const next = themeModeValue(mode);
  if (next === "dark") return true;
  if (next === "light") return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function themeSoft(color, dark = false) {
  const hex = themeHex(color);
  if (dark) return `color-mix(in srgb, ${hex} 22%, #1c1f26)`;
  const preset = THEME_PRESETS.find((item) => item.color.toLowerCase() === hex);
  return preset?.soft || `color-mix(in srgb, ${hex} 8%, white)`;
}

function applyPlainTheme(color) {
  store.updateSettings({
    themeColor: themeHex(color),
    themeSchool: null,
    themeBgTint: false,
  });
  applyAppearance();
}

async function registerCustomFont(customFont) {
  if (!customFont?.dataUrl) return false;
  if (customFontReady === customFont.dataUrl) return true;
  try {
    const face = new FontFace(CUSTOM_FONT_NAME, `url(${customFont.dataUrl})`);
    await face.load();
    document.fonts.add(face);
    customFontReady = customFont.dataUrl;
    return true;
  } catch {
    return false;
  }
}

function applyAppearance() {
  const settings = store.getState().settings || store.defaultSettings();
  const size = ["sm", "md", "lg"].includes(settings.fontSize) ? settings.fontSize : "md";
  const families = ["pretendard", "system", "notosans"];
  if (settings.customFont?.dataUrl) families.push("custom");
  const family = families.includes(settings.fontFamily) ? settings.fontFamily : "pretendard";
  const color = themeHex(settings.themeColor, THEME_PRESETS[0].color);
  const mode = themeModeValue(settings.themeMode);
  const dark = resolvedDark(mode);
  document.documentElement.setAttribute("data-theme", mode);
  const root = document.documentElement.style;
  document.body.classList.remove(
    "font-sm",
    "font-md",
    "font-lg",
    "font-pretendard",
    "font-system",
    "font-notosans",
    "font-custom",
  );
  document.body.classList.add(`font-${size}`, `font-${family}`);
  root.setProperty("--accent", color);
  root.setProperty("--accent-soft", themeSoft(color, dark));
  if (settings.themeBgTint || settings.themeSchool) {
    root.setProperty("--bg", `color-mix(in srgb, ${color} ${dark ? 10 : 4}%, var(--bg-base))`);
    root.setProperty("--rail", `color-mix(in srgb, ${color} ${dark ? 12 : 6}%, var(--rail-base))`);
  } else {
    root.removeProperty("--bg");
    root.removeProperty("--rail");
  }
  if (family === "custom") {
    document.documentElement.style.setProperty("--font-family", `"${CUSTOM_FONT_NAME}", sans-serif`);
  } else {
    document.documentElement.style.removeProperty("--font-family");
  }
}

let systemThemeBound = false;
function bindSystemTheme() {
  if (systemThemeBound || typeof window.matchMedia !== "function") return;
  systemThemeBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyAppearance();
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else mq.addListener(onChange);
}

function notifyAllowed(kind) {
  const notes = store.getState().settings?.notifications || {};
  if (kind === "group") return notes.groupUpdates !== false;
  return true;
}

function permissionLabel(state) {
  if (state === "granted") return "허용됨";
  if (state === "denied") return "거부됨";
  if (state === "prompt") return "확인 필요";
  return "확인할 수 없음";
}

async function loadPermissionStates() {
  const read = async (name) => {
    try {
      if (!navigator.permissions?.query) return "확인할 수 없음";
      const status = await navigator.permissions.query({ name });
      return permissionLabel(status.state);
    } catch {
      return "확인할 수 없음";
    }
  };
  ui.permCamera = await read("camera");
  ui.permNotify = await read("notifications");
  if (parseHash().name === "settings" && ui.settingsTab === "permissions") render();
}

function settingsAccount() {
  if (!auth.user()) {
    return `
      <div class="empty">로그인이 필요합니다.</div>
      <button class="primary" type="button" data-act="auth">로그인</button>`;
  }
  return `
    <form class="stack settings-form" data-act="change-password">
      <h3 class="settings-h">비밀번호 변경</h3>
      <input class="field" name="password" type="password" placeholder="새 비밀번호" required minlength="6">
      <input class="field" name="confirm" type="password" placeholder="새 비밀번호 확인" required minlength="6">
      <button class="primary" type="submit">비밀번호 변경</button>
    </form>
    <form class="stack settings-form" data-act="change-email">
      <h3 class="settings-h">이메일 변경</h3>
      <input class="field" name="email" type="email" placeholder="새 이메일" required>
      <button class="primary" type="submit">이메일 변경</button>
    </form>
    <div class="settings-form">
      <h3 class="settings-h">연동</h3>
      <button class="ghost" type="button" disabled>Google로 연동</button>
      <p class="page-date">Google 등 소셜 로그인 연동은 Netlify Identity 대시보드 설정이 필요합니다</p>
    </div>
    <div class="settings-form">
      <h3 class="settings-h">데이터 내보내기</h3>
      <p class="page-date">할 일, 시간표, 성적, 노트 등을 받습니다. 실행 중인 타이머와 로그인 정보는 넣지 않습니다.</p>
      <div class="settings-actions">
        <button class="ghost" type="button" data-act="export-data">JSON 백업 받기</button>
        <button class="ghost" type="button" data-act="export-gpa-csv">GPA CSV 받기</button>
      </div>
    </div>
    <div class="settings-form">
      <h3 class="settings-h">계정 삭제</h3>
      <p class="page-date">계정과 서버에 저장된 데이터가 지워지며 되돌릴 수 없습니다.</p>
      <button class="danger" type="button" data-act="open-delete-account">계정 삭제</button>
    </div>`;
}

function settingsPrivacy() {
  const settings = store.getState().settings || store.defaultSettings();
  const reject = Boolean(settings.rejectGroupInvites);
  const share = Boolean(settings.shareTimetableWithGroups);
  return `
    <div class="set-checks">
      <label class="set-check">
        <input type="checkbox" data-act="set-reject" ${reject ? "checked" : ""}>
        <span>
          <b>그룹 초대 자동 거부</b>
          <small>이 기기에서 그룹 참여 시도를 막습니다. 서버가 초대를 차단하는 기능은 아닙니다.</small>
        </span>
      </label>
      <label class="set-check">
        <input type="checkbox" data-act="set-share-timetable" ${share ? "checked" : ""}>
        <span>
          <b>대표 시간표를 팀플 그룹에 공개</b>
          <small>대표로 지정한 시간표의 요일과 바쁜 시간만 공유됩니다. 과목명·강의실은 보내지 않습니다.</small>
        </span>
      </label>
    </div>`;
}

function settingsPermissions() {
  if (!ui.permCamera && !ui.permNotify) loadPermissionStates();
  return `
    <div class="set-list">
      <div class="set-row"><span>카메라 (프로필 사진 촬영)</span><b>${escapeHtml(ui.permCamera || "확인 중")}</b></div>
      <div class="set-row"><span>알림</span><b>${escapeHtml(ui.permNotify || "확인 중")}</b></div>
    </div>
    <p class="page-date">권한은 브라우저 주소창 옆 자물쇠 아이콘에서 변경할 수 있습니다</p>`;
}

function settingsNotifications() {
  const notes = store.getState().settings?.notifications || {};
  return `
    <label class="set-check">
      <input type="checkbox" data-act="set-notify" data-key="groupUpdates" ${notes.groupUpdates !== false ? "checked" : ""}>
      <span><b>그룹 활동 알림</b></span>
    </label>`;
}

function settingsDisplay() {
  const settings = store.getState().settings || store.defaultSettings();
  const themeMode = themeModeValue(settings.themeMode);
  const modes = [
    ["system", "시스템"],
    ["light", "라이트"],
    ["dark", "다크"],
  ];
  const sizes = [
    ["sm", "작게"],
    ["md", "보통"],
    ["lg", "크게"],
  ];
  const fonts = [
    ["pretendard", "Pretendard"],
    ["system", "시스템 기본 고딕"],
    ["notosans", "Noto Sans KR"],
  ];
  if (settings.customFont?.dataUrl) {
    fonts.push(["custom", settings.customFont.name || "업로드 폰트"]);
  }
  const current = themeHex(settings.themeColor);
  const picker = current;
  const customs = store.getState().customThemePresets || [];
  return `
    <h3 class="settings-h">화면 테마</h3>
    <div class="set-pills">
      ${modes
        .map(
          ([id, label]) =>
            `<button type="button" class="ghost ${themeMode === id ? "on" : ""}" data-act="set-theme-mode" data-mode="${id}">${label}</button>`,
        )
        .join("")}
    </div>
    <h3 class="settings-h">글씨 크기</h3>
    <div class="set-pills">
      ${sizes
        .map(
          ([id, label]) =>
            `<button type="button" class="ghost ${settings.fontSize === id ? "on" : ""}" data-act="set-font-size" data-size="${id}">${label}</button>`,
        )
        .join("")}
    </div>
    <h3 class="settings-h">폰트</h3>
    <div class="set-pills">
      ${fonts
        .map(
          ([id, label]) =>
            `<button type="button" class="ghost ${settings.fontFamily === id ? "on" : ""}" data-act="set-font-family" data-family="${id}">${escapeHtml(label)}</button>`,
        )
        .join("")}
      <label class="ghost profile-file-btn">폰트 파일 업로드
        <input type="file" accept=".ttf,.otf,.woff,.woff2" data-act="upload-font">
      </label>
    </div>
    <h3 class="settings-h">졸업 이수학점</h3>
    <label class="due-field">목표 학점
      <input class="field" type="number" min="1" max="400" step="1" data-act="set-grad-credits" value="${escapeHtml(String(settings.graduationCredits || 130))}">
    </label>
    <p class="page-date">시간표 학점 탭의 졸업 이수 진행률에 쓰입니다.</p>
    <details class="settings-fold">
      <summary>테마 색상과 대학 테마</summary>
      <span class="set-theme-label">기본 색상</span>
      <div class="set-swatches">
        ${THEME_PRESETS.map((item) => {
          const hex = item.color.toLowerCase();
          const on = !settings.themeBgTint && !settings.themeSchool && current === hex;
          return `<button type="button" class="set-swatch ${on ? "on" : ""}" data-act="set-theme" data-color="${item.color}" style="background:${item.color}" aria-label="${item.label}"></button>`;
        }).join("")}
      </div>
      <span class="set-theme-label">대학 테마</span>
      <div class="school-themes">
        ${SCHOOL_THEME_PRESETS.map((item) => {
          const on = settings.themeSchool === item.id;
          return `<button type="button" class="school-theme ${on ? "on" : ""}" data-act="set-school-theme" data-id="${item.id}" data-color="${item.color}" data-name="${escapeHtml(item.name)}">
            <span class="school-theme-badge ${item.initial.length > 1 ? "wide" : ""}" style="background:${item.color}">${escapeHtml(item.initial)}</span>
            <span class="school-theme-name">${escapeHtml(item.name)}</span>
          </button>`;
        }).join("")}
      </div>
      <span class="set-theme-label">내 프리셋</span>
      ${
        customs.length
          ? `<div class="set-swatches">
              ${customs
                .map((hex) => {
                  const on = !settings.themeBgTint && !settings.themeSchool && current === hex;
                  return `<span class="course-color-item">
                    <button type="button" class="set-swatch ${on ? "on" : ""}" data-act="set-theme" data-color="${hex}" style="background:${hex}" aria-label="내 프리셋"></button>
                    <button type="button" class="course-preset-del" data-act="del-theme-preset" data-color="${hex}" aria-label="프리셋 삭제">${icon("x", 10)}</button>
                  </span>`;
                })
                .join("")}
            </div>`
          : `<p class="page-date">컬러 피커로 색을 고른 뒤 프리셋으로 저장하세요.</p>`
      }
      <div class="set-theme-custom">
        <input class="course-color-picker" type="color" data-act="theme-color-pick" value="${escapeHtml(picker)}" aria-label="색상 직접 선택">
        <button type="button" class="ghost" data-act="save-theme-preset">프리셋으로 저장</button>
      </div>
    </details>`;
}

function viewSettings() {
  const tab = ui.settingsTab || "account";
  const tabs = [
    { id: "account", label: "계정" },
    { id: "notifications", label: "알림" },
    { id: "privacy", label: "개인정보" },
    { id: "permissions", label: "권한" },
    { id: "display", label: "화면" },
  ];
  const body = {
    account: settingsAccount(),
    privacy: settingsPrivacy(),
    permissions: settingsPermissions(),
    notifications: settingsNotifications(),
    display: settingsDisplay(),
  }[tab];
  return `
    ${top("설정", "계정과 화면을 이 기기에서 조정합니다")}
    <div class="settings-page">
      <nav class="settings-nav">
        ${tabs
          .map(
            (item) =>
              `<button type="button" class="${tab === item.id ? "on" : ""}" data-act="settings-tab" data-tab="${item.id}">${item.label}</button>`,
          )
          .join("")}
      </nav>
      <div class="settings-panel">${body}</div>
    </div>`;
}

function stopwatchNow(now = Date.now()) {
  const sw = ui.stopwatch;
  if (!sw.running) return sw.accumulated;
  return sw.accumulated + Math.max(0, Math.floor((now - sw.startedAt) / 1000));
}

function liveMeasure() {
  const s = store.getState();
  const task = s.tasks.find((item) => item.id === s.activeTimer?.taskId);
  const cat = store.categoryById(task?.categoryId);
  if (!task) return "";
  return `
    <section class="live-measure">
      <div class="live-copy">
        <div class="night-badge"><span class="dot" style="background:${cat?.color || "#2563eb"}"></span>${escapeHtml(cat?.name || "")}</div>
        <h2 class="live-title">${escapeHtml(task.title)}</h2>
      </div>
      <div class="live-clock" data-clock="desk">${clock(store.elapsedNow())}</div>
      <div class="night-controls">
        <button class="night-pause" data-act="${s.activeTimer.isRunning ? "pause" : "resume"}" aria-label="${s.activeTimer.isRunning ? "일시정지" : "재개"}">${s.activeTimer.isRunning ? icon("pause", 22) : icon("play", 22)}</button>
        <button class="night-stop" data-act="finish">${icon("stop", 16)} 측정 종료</button>
      </div>
    </section>`;
}

function calcKeys() {
  return ["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", "."]
    .map((key) => {
      const extra = key === "0" ? " span2" : key === "=" ? " eq" : "";
      const op = "÷×−+=C⌫".includes(key) ? " op" : "";
      return `<button type="button" class="calc-key${op}${extra}" data-act="calc" data-key="${escapeHtml(key)}">${key}</button>`;
    })
    .join("");
}

function toolSheet() {
  if (!ui.tool) return "";
  const remain = store.remainingNow();
  const aux = store.getState().auxiliaryTimer;
  const title = { timer: "타이머", stopwatch: "스톱워치", calculator: "계산기" }[ui.tool];
  let body = "";
  if (ui.tool === "timer") body = auxPanel(aux, remain);
  if (ui.tool === "stopwatch") {
    const running = ui.stopwatch.running;
    body = `
      <div class="sw-clock" data-clock="sw">${clock(stopwatchNow())}</div>
      <div class="night-controls">
        <button class="night-pause" data-act="${running ? "sw-pause" : "sw-start"}">${running ? icon("pause", 20) : icon("play", 20)}</button>
        <button class="ghost" data-act="sw-reset">초기화</button>
      </div>`;
  }
  if (ui.tool === "calculator") {
    body = `
      <div class="calc-display" data-calc-display>${escapeHtml(ui.calc.display)}</div>
      <div class="calc-pad">${calcKeys()}</div>`;
  }
  return `
    <div class="tool-sheet" data-stop="1">
      <div class="tool-sheet-bar">
        <b>${title}</b>
        <button class="night-x" data-act="close-tool" aria-label="닫기">${icon("x", 16)}</button>
      </div>
      ${body}
    </div>`;
}

function applyCalc(key) {
  const calc = ui.calc;
  const value = () => Number(calc.display);
  const finish = () => {
    if (calc.left == null || !calc.op) return;
    const right = value();
    const map = {
      "+": calc.left + right,
      "−": calc.left - right,
      "×": calc.left * right,
      "÷": right === 0 ? "오류" : calc.left / right,
    };
    const result = map[calc.op];
    calc.display = String(result);
    calc.left = typeof result === "number" ? result : null;
    calc.op = null;
    calc.fresh = true;
  };
  if (key === "C") {
    ui.calc = { display: "0", left: null, op: null, fresh: true };
    return;
  }
  if (key === "⌫") {
    calc.display = calc.display.length <= 1 || calc.display === "오류" ? "0" : calc.display.slice(0, -1);
    calc.fresh = false;
    return;
  }
  if (["+", "−", "×", "÷"].includes(key)) {
    if (calc.left != null && calc.op && !calc.fresh) finish();
    calc.left = value();
    calc.op = key;
    calc.fresh = true;
    return;
  }
  if (key === "=") {
    finish();
    return;
  }
  if (key === ".") {
    if (calc.fresh) {
      calc.display = "0.";
      calc.fresh = false;
      return;
    }
    if (!calc.display.includes(".")) calc.display += ".";
    return;
  }
  if (calc.fresh || calc.display === "0" || calc.display === "오류") calc.display = key;
  else calc.display += key;
  calc.fresh = false;
}

function viewFocus(section) {
  const s = store.getState();
  const task = s.tasks.find((item) => item.id === s.activeTimer?.taskId);
  const tabs = [
    { id: "today", label: "오늘 할 일" },
    { id: "calendar", label: "캘린더" },
    { id: "projects", label: "프로젝트" },
    { id: "groups", label: "그룹" },
  ];
  const current = tabs.some((tab) => tab.id === section) ? section : "today";
  const body = {
    today: `${liveMeasure()}${viewToday(true)}`,
    calendar: viewCalendar(),
    projects: viewProjects(ui.notePageId),
    groups: viewGroups(),
  }[current];
  return `
    <div class="desk">
      ${ui.nightEnter ? `<div class="desk-veil"></div>` : ""}
      <div class="desk-bar">
        <button class="night-x" data-act="leave-desk" aria-label="나가기">${icon("x")}</button>
        <div class="desk-bar-mid">
          <div class="desk-live" data-clock="desk">${clock(store.elapsedNow())}</div>
          <div class="desk-task">${escapeHtml(task?.title || "측정 중")}</div>
        </div>
        <button class="night-x" data-act="open-search" aria-label="검색">${icon("search")}</button>
        <div class="tools-wrap">
          <button class="night-x" data-act="toggle-tools" aria-label="측정 중 도구">${icon("apps")}</button>
          ${
            ui.toolsOpen
              ? `<div class="tools-menu">
                  <button data-act="open-tool" data-tool="timer">${icon("timer", 16)} 타이머</button>
                  <button data-act="open-tool" data-tool="stopwatch">${icon("clock", 16)} 스톱워치</button>
                  <button data-act="open-tool" data-tool="calculator">${icon("calc", 16)} 계산기</button>
                </div>`
              : ""
          }
        </div>
      </div>
      <div class="desk-tabs">
        ${tabs.map((tab) => `<a class="desk-tab ${current === tab.id ? "on" : ""}" href="#/focus/${tab.id}">${tab.label}</a>`).join("")}
      </div>
      <div class="desk-body">${body}</div>
      ${toolSheet()}
    </div>`;
}

function authFormHtml() {
  const signup = ui.authMode === "signup";
  const notice = String(ui.authNotice || "").trim();
  return `
      <div class="auth-modes" role="tablist">
        <button class="auth-mode ${signup ? "" : "on"}" type="button" role="tab" aria-selected="${signup ? "false" : "true"}" data-act="auth-mode" data-mode="login">로그인</button>
        <button class="auth-mode ${signup ? "on" : ""}" type="button" role="tab" aria-selected="${signup ? "true" : "false"}" data-act="auth-mode" data-mode="signup">회원가입</button>
      </div>
      ${notice ? `<p class="auth-gate-notice">${escapeHtml(notice)}</p>` : ""}
      <form class="stack" data-act="${signup ? "signup" : "login"}">
        <input class="field" name="email" type="email" placeholder="이메일" required autocomplete="email">
        <input class="field" name="password" type="password" placeholder="${signup ? "비밀번호 (6자 이상)" : "비밀번호"}" required minlength="6" autocomplete="${signup ? "new-password" : "current-password"}">
        ${signup ? `<input class="field" name="name" placeholder="이름" required autocomplete="name">` : ""}
        <button class="primary" type="submit">${signup ? "가입하기" : "로그인"}</button>
      </form>`;
}

function authPreviewHtml() {
  return `
    <section class="auth-preview" aria-hidden="true">
      <div class="auth-gate-brand">
        <div class="brand-mark">${icon("sparkle", 20)}</div>
        <div>
          <div class="brand-name">Focusuniv</div>
          <div class="brand-sub">오늘 할 일, 시간표, 한 개의 시계</div>
        </div>
      </div>
      <p class="auth-preview-lead">수업과 팀플 사이를 한 화면에서 잇습니다. 측정은 할 일 하나에만 걸립니다.</p>
      <div class="auth-mock">
        <div class="auth-mock-card">
          <div class="auth-mock-kicker">오늘 할 일</div>
          <div class="auth-mock-row"><i style="background:#0EA5E9"></i><b>자료구조 과제</b><span>32분</span></div>
          <div class="auth-mock-row"><i style="background:#6366F1"></i><b>팀 회의 준비</b><span>18분</span></div>
          <div class="auth-mock-row"><i style="background:#16A34A"></i><b>저녁 러닝</b><span>—</span></div>
        </div>
        <div class="auth-mock-card auth-mock-tt">
          <div class="auth-mock-kicker">시간표</div>
          <div class="auth-mock-grid">
            <span></span><span>월</span><span>화</span><span>수</span>
            <em>10</em><b class="on"></b><i></i><b class="on mid"></b>
            <em>12</em><i></i><b class="on late"></b><i></i>
          </div>
        </div>
      </div>
    </section>`;
}

function authLoadingHtml() {
  return `<div class="auth-gate" aria-busy="true" aria-live="polite">
    <div class="auth-gate-card">
      <div class="auth-spin" aria-hidden="true"></div>
      <p class="page-date">불러오는 중</p>
    </div>
  </div>`;
}

function authGateHtml() {
  const signup = ui.authMode === "signup";
  return `<div class="auth-gate">
    <div class="auth-gate-shell">
      ${authPreviewHtml()}
      <section class="auth-panel">
        <div class="auth-gate-card">
          <h2>${signup ? "회원가입" : "로그인"}</h2>
          <p class="auth-panel-sub">계정으로 이 기기와 서버 기록이 맞춰집니다.</p>
          ${authFormHtml()}
        </div>
      </section>
    </div>
  </div>`;
}

const SEARCH_GROUPS = [
  ["task", "할 일"],
  ["course", "시간표"],
  ["group", "그룹"],
  ["project", "프로젝트"],
];

function globalSearchHitsHtml(hits) {
  const q = String(ui.searchQuery || "").trim();
  if (!q) return `<p class="page-date">할 일, 수업, 그룹, 노트를 검색하세요.</p>`;
  if (!hits.length) return `<div class="empty">일치하는 항목이 없습니다.</div>`;
  return SEARCH_GROUPS.map(([type, label]) => {
    const rows = hits.filter((item) => item.type === type);
    if (!rows.length) return "";
    return `<div class="search-group">
      <div class="group-title">${label}</div>
      <div class="list">
        ${rows
          .map(
            (item) =>
              `<button type="button" class="search-hit" data-act="go-search-hit" data-route="${escapeHtml(item.route)}" data-type="${item.type}" data-id="${item.id}" data-tt="${escapeHtml(item.timetableId || "")}">
                <b>${escapeHtml(item.label)}</b>
                ${item.meta ? `<span class="task-meta">${escapeHtml(item.meta)}</span>` : ""}
              </button>`,
          )
          .join("")}
      </div>
    </div>`;
  }).join("");
}

let searchTimer = 0;
function queueGlobalSearch(query) {
  ui.searchQuery = query;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    ui.searchHits = store.globalSearch(query);
    const box = document.querySelector("[data-global-search-hits]");
    if (box) box.innerHTML = globalSearchHitsHtml(ui.searchHits);
  }, 300);
}

function modalHtml() {
  if (!ui.modal) return "";
  if (ui.modal === "auth") return "";
  if (ui.modal === "search") {
    return `<div class="modal-back" data-act="close-modal"><div class="modal search-modal" data-stop="1">
      <h2>검색</h2>
      <input class="field" data-act="global-query" value="${escapeHtml(ui.searchQuery)}" placeholder="할 일, 수업, 그룹, 노트" autocomplete="off">
      <div class="search-hits" data-global-search-hits>${globalSearchHitsHtml(ui.searchHits)}</div>
    </div></div>`;
  }
  if (ui.modal === "event") {
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>일정 추가</h2>
      <form class="stack" data-act="add-event">
        ${eventFormFields()}
        <button class="primary" type="submit">추가</button>
        <button class="ghost" type="button" data-act="close-modal">취소</button>
      </form>
    </div></div>`;
  }
  if (ui.modal === "event-edit") {
    const event = (store.getState().events || []).find((item) => item.id === ui.eventId);
    if (!event) return "";
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>일정 수정</h2>
      <form class="stack" data-act="save-event">
        <input type="hidden" name="id" value="${escapeHtml(event.id)}">
        ${eventFormFields(event)}
        <button class="primary" type="submit">저장</button>
        <button class="ghost" type="button" data-act="show-event" data-id="${event.id}">취소</button>
      </form>
    </div></div>`;
  }
  if (ui.modal === "event-detail") {
    const event = (store.getState().events || []).find((item) => item.id === ui.eventId);
    if (!event) return "";
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>${escapeHtml(event.title || "일정")}</h2>
      <p class="modal-meta">${escapeHtml(event.date || "")} · ${escapeHtml(event.startTime || "")}–${escapeHtml(event.endTime || "")}</p>
      <div class="stack">
        <button class="primary" type="button" data-act="edit-event" data-id="${event.id}">수정</button>
        <button class="danger" type="button" data-act="del-event" data-id="${event.id}">삭제</button>
        <button class="ghost" type="button" data-act="close-modal">닫기</button>
      </div>
    </div></div>`;
  }
  if (ui.modal === "task-edit") {
    const task = store.getState().tasks.find((item) => item.id === ui.editingTaskId);
    if (!task) return "";
    const cats = store.getState().categories;
    const extra = task.groupId
      ? `<input class="field" name="assigneeName" placeholder="담당자" value="${escapeHtml(task.assigneeName || "")}">
         <input class="field" name="dueDate" type="date" value="${escapeHtml(task.dueDate || "")}" required>`
      : `<select class="field" name="categoryId">
           ${cats
             .map(
               (cat) =>
                 `<option value="${cat.id}" ${task.categoryId === cat.id ? "selected" : ""}>${escapeHtml(cat.name)}</option>`,
             )
             .join("")}
         </select>
         <input class="field" name="scheduledDate" type="date" value="${escapeHtml(task.scheduledDate || "")}" required>
         <label class="due-field">마감 (선택)<input class="field" name="dueDate" type="date" value="${escapeHtml(task.dueDate || "")}"></label>`;
    const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
    const freq = task.repeat?.freq || "";
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>할 일 수정</h2>
      <form class="stack" data-act="save-task">
        <input class="field" name="title" placeholder="할 일" value="${escapeHtml(task.title)}" required>
        <input class="field" name="note" placeholder="메모 (선택)" value="${escapeHtml(task.note || "")}">
        ${extra}
        <label class="due-field">우선순위
          <select class="field" name="priority">
            <option value="high" ${task.priority === "high" ? "selected" : ""}>높음</option>
            <option value="normal" ${task.priority !== "high" && task.priority !== "low" ? "selected" : ""}>보통</option>
            <option value="low" ${task.priority === "low" ? "selected" : ""}>낮음</option>
          </select>
        </label>
        <label class="due-field">반복
          <select class="field" name="repeatFreq">
            <option value="" ${freq ? "" : "selected"}>안 함</option>
            <option value="daily" ${freq === "daily" ? "selected" : ""}>매일</option>
            <option value="weekly" ${freq === "weekly" ? "selected" : ""}>매주</option>
          </select>
        </label>
        <label class="due-field">반복 종료
          <input class="field" name="repeatUntil" type="date" value="${escapeHtml(task.repeat?.until || "")}">
        </label>
        <div class="subtask-editor">
          <span class="due-field">하위 항목</span>
          ${subs
            .map(
              (item) => `<div class="subtask-row">
                <button type="button" class="check ${item.done ? "done" : ""}" data-act="toggle-subtask" data-id="${task.id}" data-sub="${item.id}" aria-label="하위 항목 완료">${item.done ? icon("check", 12) : ""}</button>
                <span class="${item.done ? "done" : ""}">${escapeHtml(item.title)}</span>
                <button type="button" class="ghost subtask-del" data-act="del-subtask" data-id="${task.id}" data-sub="${item.id}" aria-label="하위 항목 삭제">${icon("x", 12)}</button>
              </div>`,
            )
            .join("")}
          <div class="subtask-add">
            <input class="field" data-act="subtask-title" placeholder="하위 항목 추가">
            <button type="button" class="ghost" data-act="add-subtask" data-id="${task.id}">추가</button>
          </div>
        </div>
        <button class="primary" type="submit">저장</button>
        <button class="ghost" type="button" data-act="close-modal">취소</button>
      </form>
    </div></div>`;
  }
  if (ui.modal === "course") {
    const course = store.courseById(ui.courseId);
    const tiles = courseColorTiles();
    const picked = ui.courseColorDraft || course?.color || tiles[0]?.value || "#0EA5E9";
    const pickerValue = /^#[0-9A-Fa-f]{6}$/.test(picked) ? picked : "#0EA5E9";
    const days = ["월", "화", "수", "목", "금", "토", "일"];
    const slots = ui.courseSlotsDraft?.length ? ui.courseSlotsDraft : store.courseSlots(course);
    const draft = ui.courseFormDraft || {};
    if (course && ui.courseDeleteConfirm) {
      return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
        <h2>수업 삭제</h2>
        <p>이 수업을 삭제할까요?</p>
        <div class="row-actions">
          <button type="button" class="danger" data-act="confirm-del-course" data-id="${course.id}">삭제</button>
          <button type="button" class="ghost" data-act="cancel-del-course">취소</button>
        </div>
      </div></div>`;
    }
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>${course ? "수업 수정" : "수업 추가"}</h2>
      <form class="stack" data-act="add-course">
        <input type="hidden" name="id" value="${course?.id || ""}">
        <input type="hidden" name="color" value="${escapeHtml(picked)}">
        <input class="field" name="title" placeholder="과목명" value="${escapeHtml(draft.title ?? course?.title ?? "")}" required>
        <div class="course-slots">
          ${slots
            .map(
              (slot, idx) => `<div class="course-slot">
            <select class="field" data-act="course-slot-field" data-idx="${idx}" data-field="day">
              ${days.map((label, i) => `<option value="${i + 1}" ${Number(slot.day) === i + 1 ? "selected" : ""}>${label}</option>`).join("")}
            </select>
            <input class="field" type="time" data-act="course-slot-field" data-idx="${idx}" data-field="startTime" value="${slot.startTime || "09:00"}">
            <input class="field" type="time" data-act="course-slot-field" data-idx="${idx}" data-field="endTime" value="${slot.endTime || "10:30"}">
            ${
              slots.length > 1
                ? `<button type="button" class="ghost course-slot-del" data-act="del-course-slot" data-idx="${idx}">삭제</button>`
                : `<span class="course-slot-del-ph"></span>`
            }
          </div>`,
            )
            .join("")}
          <button type="button" class="ghost course-slot-add" data-act="add-course-slot">+ 요일/시간 추가</button>
        </div>
        <input class="field" name="room" placeholder="강의실" value="${escapeHtml(draft.room ?? course?.room ?? "")}">
        <input class="field" name="professor" placeholder="교수님" value="${escapeHtml(draft.professor ?? course?.professor ?? "")}">
        <div class="course-color-block">
          <span class="course-color-label">프리셋</span>
          <div class="course-color-swatches" role="group" aria-label="수업 색상 프리셋">
            ${tiles
              .map(
                (item) =>
                  `<span class="course-color-item">
                    <button type="button" class="course-color-swatch ${picked.toLowerCase() === item.value.toLowerCase() ? "on" : ""}" data-act="pick-course-color" data-color="${item.value}" style="background:${item.value}" aria-label="${item.locked ? "카테고리 색" : "프리셋 색"}"></button>
                    ${
                      item.locked
                        ? ""
                        : `<button type="button" class="course-preset-del" data-act="del-course-preset" data-color="${item.value}" aria-label="프리셋 삭제">${icon("x", 10)}</button>`
                    }
                  </span>`,
              )
              .join("")}
          </div>
          <span class="course-color-label">직접 선택</span>
          <div class="course-color-custom">
            <input class="course-color-picker" type="color" data-act="course-color-pick" value="${escapeHtml(pickerValue)}" aria-label="색상 직접 선택">
            <button type="button" class="ghost" data-act="save-course-preset">프리셋으로 저장</button>
          </div>
        </div>
        <input class="field" name="memo" placeholder="메모 (선택)" value="${escapeHtml(draft.memo ?? course?.memo ?? "")}">
        <div class="row-actions">
          ${course ? `<button type="button" class="danger" data-act="ask-del-course">삭제</button>` : ""}
          <button class="primary" type="submit">${course ? "저장" : "추가"}</button>
          <button class="ghost" type="button" data-act="close-modal">취소</button>
        </div>
      </form>
    </div></div>`;
  }
  if (ui.modal === "poll") {
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>약속 잡기 만들기</h2>
      <form class="stack" data-act="create-poll">
        <input type="hidden" name="groupId" value="${escapeHtml(ui.pollGroupId || "")}">
        <input class="field" name="title" placeholder="제목 (예: 1차 회의)" required>
        <label class="due-field">시작일<input class="field" name="fromDate" type="date" value="${todayKey()}" required></label>
        <label class="due-field">종료일<input class="field" name="toDate" type="date" value="${formatDateKey(addDays(new Date(), 4))}" required></label>
        <div class="composer-extra">
          <input class="field" name="startTime" type="time" value="09:00" required>
          <input class="field" name="endTime" type="time" value="22:00" required>
        </div>
        <p class="page-date">최대 14일까지 한 번에 고를 수 있어요</p>
        <button class="primary" type="submit">만들기</button>
        <button class="ghost" type="button" data-act="close-modal">취소</button>
      </form>
    </div></div>`;
  }
  if (ui.modal === "poll-rename") {
    const poll = remotePolls.find((item) => item.id === ui.pollEditId);
    if (!poll) return "";
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>약속 이름 수정</h2>
      <form class="stack" data-act="save-poll-title">
        <input type="hidden" name="id" value="${escapeHtml(poll.id)}">
        <input class="field" name="title" placeholder="제목" value="${escapeHtml(poll.title || "")}" required>
        <button class="primary" type="submit">저장</button>
        <button class="ghost" type="button" data-act="close-modal">취소</button>
      </form>
    </div></div>`;
  }
  if (ui.modal === "delete-account") {
    const email = String(auth.user()?.email || "");
    return `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop="1">
      <h2>계정을 삭제할까요?</h2>
      <p class="delete-warn">이 작업은 되돌릴 수 없습니다.</p>
      <p class="page-date">할 일, 시간표, 성적, 그룹 참여 정보와 로그인 계정이 모두 삭제됩니다. 확인을 위해 ${email ? `<b>${escapeHtml(email)}</b>` : "가입한 이메일"}을 다시 입력하세요.</p>
      <form class="stack" data-act="confirm-delete-account">
        <input class="field" name="email" type="email" placeholder="이메일 재입력" required autocomplete="off" ${ui.deletingAccount ? "disabled" : ""}>
        <button class="danger" type="submit" ${ui.deletingAccount ? "disabled" : ""}>${ui.deletingAccount ? "삭제 중…" : "계정 영구 삭제"}</button>
        <button class="ghost" type="button" data-act="close-modal" ${ui.deletingAccount ? "disabled" : ""}>취소</button>
      </form>
    </div></div>`;
  }
  if (ui.modal === "new-page-choice") {
    return `<div class="modal-back" data-act="close-modal"><div class="modal new-page-choice" data-stop="1">
      <h2>새 페이지</h2>
      <p class="page-date">빈 문서를 만들거나 PDF를 페이지로 불러오세요.</p>
      <div class="choice-cards">
        <button type="button" class="choice-card" data-act="new-page-blank">
          ${icon("page", 28)}
          <b>새 문서 작성</b>
          <span>빈 페이지에서 블록으로 작성합니다</span>
        </button>
        <button type="button" class="choice-card" data-act="new-page-pdf">
          ${icon("pdf", 28)}
          <b>PDF 불러오기</b>
          <span>PDF를 페이지로 열어 열람합니다</span>
        </button>
      </div>
    </div></div>`;
  }
  return "";
}

function moreSheetHtml(active) {
  if (!ui.navMore) return "";
  return `
    <div class="more-back" data-act="close-more">
      <div class="more-sheet" data-stop="1">
        <p class="more-sheet-label">더보기</p>
        ${moreNavItems()
          .map(
            (item) =>
              `<a class="${active === item.name ? "on" : ""}" href="${item.href}">${icon(item.ic, 18)} ${item.label}</a>`,
          )
          .join("")}
      </div>
    </div>`;
}

function bottomNavHtml(active) {
  const moreOn = ui.navMore || moreNavItems().some((item) => item.name === active);
  return `
    <nav class="bottom-nav">
      ${primaryNavItems()
        .map((item) => `<a class="${active === item.name ? "active" : ""}" href="${item.href}">${icon(item.ic, 18)}<span>${item.label}</span></a>`)
        .join("")}
      <button type="button" class="${moreOn ? "active" : ""}" data-act="toggle-more" aria-expanded="${ui.navMore ? "true" : "false"}">${icon("menu", 18)}<span>더보기</span></button>
    </nav>
    ${moreSheetHtml(active)}`;
}

function layout(active, body, desk = false) {
  if (desk) return body + modalHtml();
  return `
    <div class="shell">
      ${side(active)}
      <main class="main">${body}</main>
    </div>
    ${bottomNavHtml(active)}
    ${modalHtml()}`;
}

export function render() {
  applyAppearance();
  const root = document.getElementById("app");
  if (!root) return;
  if (!ui.authReady) {
    root.innerHTML = authLoadingHtml();
    return;
  }
  if (!auth.user()) {
    ui.modal = null;
    root.innerHTML = authGateHtml();
    requestAnimationFrame(() => {
      const email = document.querySelector(".auth-gate [name='email']");
      if (email && document.activeElement === document.body) email.focus();
    });
    return;
  }
  if (!ui.accountReady) {
    root.innerHTML = authLoadingHtml();
    return;
  }
  if (ui.onboarding && parseHash().name !== "profile") {
    if (location.hash !== "#/profile") go("/profile");
    root.innerHTML = layout("profile", viewProfile());
    syncKeyboard();
    return;
  }
  const route = parseHash();
  const { name, id } = route;
  let html = "";
  if (name === "focus") html = layout("focus", viewFocus(id || "today"), true);
  else if (name === "timeline") html = layout("timeline", viewTimeline());
  else if (name === "timer") {
    html = store.getState().activeTimer
      ? layout("focus", viewFocus("today"), true)
      : layout("today", viewToday());
  }
  else if (name === "calendar") html = layout("calendar", viewCalendar());
  else if (name === "timetable") html = layout("timetable", viewTimetable());
  else if (name === "projects") {
    const page = id ? store.projectById(id) : null;
    const gid = inheritedGroupId(page);
    if (gid) {
      go(groupPath(gid, "projects", id));
      html = layout("groups", viewGroups(gid));
    } else {
      html = layout("projects", viewProjects(id));
    }
  }
  else if (name === "groups") html = layout("groups", viewGroups(id));
  else if (name === "profile") html = layout("profile", viewProfile());
  else if (name === "settings") html = layout("settings", viewSettings());
  else if (name === "categories") html = layout("categories", viewCategories());
  else html = layout("today", viewToday());
  root.innerHTML = html;
  if (ui.toast) showToast(ui.toast);
  const veil = document.querySelector(".desk-veil");
  if (veil) {
    veil.addEventListener(
      "animationend",
      () => {
        ui.nightEnter = false;
        veil.remove();
      },
      { once: true },
    );
  }
  syncKeyboard();
  const pdfHost = document.querySelector("[data-pdf-viewer]");
  if (pdfHost) mountPdfViewer(pdfHost);
  else dropPdfDocCache();
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBackupJson() {
  const payload = store.exportBackupPayload();
  downloadBlob(
    `focusuniv-backup-${formatDateKey(new Date())}.json`,
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
}

function exportGpaCsvFile() {
  downloadBlob(
    `focusuniv-gpa-${formatDateKey(new Date())}.csv`,
    new Blob([store.exportGpaCsv()], { type: "text/csv;charset=utf-8" }),
  );
}

function leaveDeletedAccount() {
  store.purgeLocalAccount();
  ui.onboarding = false;
  ui.authNotice = "";
  ui.authMode = "login";
  ui.modal = null;
  ui.accountReady = false;
  ui.deletingAccount = false;
  auth.logout().finally(() => {
    go("/today");
    render();
  });
}

function showToast(note, kind) {
  if (!notifyAllowed(kind)) return;
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  stack.innerHTML = `<button class="toast" data-act="${note.id ? "open-note" : "dismiss-toast"}" data-id="${note.id || ""}">
    <b>${escapeHtml(note.title)}</b><span>${escapeHtml(note.body)}</span></button>`;
}

function patchClocks() {
  const elapsed = store.elapsedNow();
  const remain = store.remainingNow();
  const aux = store.getState().auxiliaryTimer;
  document.querySelectorAll("[data-clock='main']").forEach((el) => {
    el.textContent = aux ? clock(remain) : clock(elapsed);
  });
  document.querySelectorAll("[data-clock='aux']").forEach((el) => {
    el.textContent = aux ? clock(remain) : "00:00:00";
  });
  document.querySelectorAll("[data-clock='desk']").forEach((el) => {
    el.textContent = clock(elapsed);
  });
  document.querySelectorAll("[data-clock='sw']").forEach((el) => {
    el.textContent = clock(stopwatchNow());
  });
  const arc = document.querySelector("[data-ring-arc]");
  if (arc) {
    const r = 88;
    const c = 2 * Math.PI * r;
    const p = timerProgress();
    arc.setAttribute("stroke-dashoffset", String(c * (1 - p)));
  }
  if (aux?.isRunning && remain <= 0) {
    store.stopAuxiliary();
    ui.toast = { title: "타이머 종료", body: "설정한 시간이 끝났습니다.", id: "" };
    render();
  }
}

function playTask(taskId) {
  const s = store.getState();
  const task = s.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (s.activeTimer && s.activeTimer.taskId !== taskId) {
    ui.toast = { title: "다른 타이머가 실행 중입니다", body: "먼저 저장하거나 취소하세요." };
    go("/focus/today");
    render();
    return;
  }
  if (!s.activeTimer) {
    store.startTimer(taskId);
    ui.nightEnter = true;
  }
  go("/focus/today");
  render();
}

function maybeMaterializeToday() {
  if (dateKeyFrom(ui.date) === todayKey()) store.materializeRecurringTasks(todayKey());
}

function shiftDate(which, amount) {
  if (which === "timeline") ui.timeline = addDays(ui.timeline, amount);
  else {
    ui.date = addDays(ui.date, amount);
    maybeMaterializeToday();
  }
}

function pagePlainText(page) {
  const blocks =
    Array.isArray(page.tabs) && page.tabs.length
      ? page.tabs.flatMap((tab) => tab.blocks || [])
      : page.blocks || [];
  return blocks
    .map((block) => {
      if (block.type === "table") return [...(block.headers || []), ...(block.rows || []).flat()].join(" ");
      if (block.type === "image" || block.type === "file" || block.type === "pdf" || block.type === "divider") return "";
      return htmlToText(block.text || "");
    })
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function applyMeetingNotes(page, result) {
  const extra = [];
  const summary = String(result?.summary || "").trim();
  if (summary) extra.push(store.newBlock("callout", summary));
  for (const item of result?.decisions || []) {
    const text = String(item || "").trim();
    if (text) extra.push(store.newBlock("bullet", text));
  }
  if (extra.length) commitBlocks(page.id, [...page.blocks, ...extra]);
  for (const item of result?.tasks || []) {
    const title = String(item?.title || "").trim();
    if (!title) continue;
    store.addTask({
      title,
      assigneeName: item.assigneeName || "",
      groupId: page.groupId,
      categoryId: "work",
      scheduledDate: item.dueDate || todayKey(),
      dueDate: item.dueDate || todayKey(),
    });
  }
}

async function runMeetingAi(pageId) {
  const page = store.projectById(pageId);
  if (!page?.groupId) return;
  const text = pagePlainText(page);
  if (!text) {
    alert("정리할 회의록 텍스트가 없습니다.");
    return;
  }
  try {
    const result = await auth.askCoach({ action: "meeting", text });
    if (!result || result.error) throw new Error(result?.error || "empty");
    applyMeetingNotes(page, result);
    render();
    ui.toast = { title: "회의록 정리", body: "요약과 할 일을 반영했습니다.", id: "" };
    showToast(ui.toast, "group");
  } catch {
    alert("AI 연동이 설정되지 않았어요. netlify dev로 실행하고 OPENAI_API_KEY를 설정해주세요");
  }
}

function togglePollSlot(pollId, slot) {
  if (!requireLoginForGroups()) {
    render();
    return;
  }
  const poll = remotePolls.find((item) => item.id === pollId);
  if (!poll) return;
  const uid = auth.user()?.id;
  const current = new Set(pollResponsesFor(poll).find((row) => row.userId === uid)?.slots || []);
  if (current.has(slot)) current.delete(slot);
  else current.add(slot);
  const next = [...current];
  ui.pollDrafts = { ...ui.pollDrafts, [pollId]: next };
  ui.pollHover = { pollId, slot };
  render();
  const seq = (pollSaveSeq[pollId] = (pollSaveSeq[pollId] || 0) + 1);
  auth
    .markAvailability(pollId, next, {
      inviteCode: store.getState().groups.find((item) => item.id === poll.groupId)?.inviteCode,
    })
    .then((data) => {
      if (seq !== pollSaveSeq[pollId]) return;
      const row = data?.response || { userId: uid, slots: next };
      remotePolls = remotePolls.map((item) => {
        if (item.id !== pollId) return item;
        const responses = Array.isArray(item.responses) ? [...item.responses] : [];
        const idx = responses.findIndex((entry) => entry.userId === uid);
        if (idx >= 0) responses[idx] = { ...responses[idx], ...row, slots: next };
        else responses.push({ ...row, slots: next });
        return { ...item, responses };
      });
    })
    .catch(() => {
      alert("가능 시간을 저장하지 못했어요. 로그인 상태와 그룹 멤버 여부를 확인해주세요.");
    });
}

async function runFindAvailability(form) {
  if (!requireLoginForGroups()) {
    render();
    return;
  }
  const groupId = String(form.groupId?.value || "");
  const group = store.getState().groups.find((item) => item.id === groupId);
  if (!group) return;
  const members = (group.memberIds || [])
    .map((memberId) => {
      const profile = remoteProfiles.find((item) => item.userId === memberId);
      return { name: memberLabel(memberId), busySlots: Array.isArray(profile?.busySlots) ? profile.busySlots : [] };
    })
    .filter((item) => item.busySlots.length);
  if (!members.length) return;
  ui.availLoading = true;
  ui.availGroupId = groupId;
  ui.availResult = null;
  render();
  try {
    const result = await auth.findAvailability(members, {
      targetDates: datesBetween(form.fromDate?.value || todayKey(), form.toDate?.value || todayKey()),
      rangeStart: form.rangeStart?.value || "09:00",
      rangeEnd: form.rangeEnd?.value || "22:00",
    });
    ui.availResult = result && !result.error ? result : { summary: "가능한 시간을 찾지 못했어요.", suggestions: [] };
  } catch {
    ui.availResult = {
      summary: "AI 연동이 설정되지 않았어요. netlify dev로 실행하고 OPENAI_API_KEY를 설정해주세요",
      suggestions: [],
    };
  }
  ui.availLoading = false;
  render();
}

function currentPageId() {
  const route = parseHash();
  if (route.name === "projects" && route.id) return route.id;
  const ctx = groupRoute(route);
  if (ctx?.pageId) return ctx.pageId;
  if (ui.notePageId) return ui.notePageId;
  return null;
}

function placeCaretEnd(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretAtStart(el) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length === 0;
}

function saveBlockFromEl(el) {
  const page = store.projectById(currentPageId());
  if (!page || isFolderItem(page) || !el?.dataset.id) return;
  const html = sanitizeNoteHtml(el.innerHTML);
  commitBlocks(
    page.id,
    page.blocks.map((block) => (block.id === el.dataset.id ? { ...block, text: html } : block)),
    { debounce: true },
  );
}

function refocusBlock(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-id="${id}"]`);
    el?.focus();
    placeCaretEnd(el);
  });
}

function applyNoteStyle(type) {
  const page = store.projectById(currentPageId());
  if (!page || isFolderItem(page)) return;
  const targetId = ui.selectedBlockId || page.blocks[0]?.id;
  if (!targetId) return;
  const current = page.blocks.find((block) => block.id === targetId);
  if (!current) return;
  if (current.type === type && (type === "bullet" || type === "numbered" || type === "checklist")) {
    type = "paragraph";
  }
  const next = page.blocks.map((block) => {
    if (block.id !== targetId) return block;
    if (type === "table") {
      const fresh = store.newBlock("table");
      fresh.id = block.id;
      fresh.indent = block.indent || 0;
      if (block.comments) fresh.comments = block.comments;
      const cell = htmlToText(block.text || "").trim();
      if (cell) fresh.rows[0][0] = cell;
      return fresh;
    }
    if (type === "image") {
      const fresh = store.newBlock("image");
      fresh.id = block.id;
      fresh.indent = block.indent || 0;
      if (block.comments) fresh.comments = block.comments;
      return fresh;
    }
    const fromTable =
      block.type === "table"
        ? [...(block.headers || []), ...(block.rows || []).flat()].filter(Boolean).join(" ")
        : "";
    const text = type === "code" ? htmlToText(block.text || fromTable) : block.text || fromTable;
    const fresh = store.newBlock(type, text);
    fresh.id = block.id;
    fresh.indent = block.indent || 0;
    if (block.fontSize) fresh.fontSize = block.fontSize;
    if (block.fontFamily) fresh.fontFamily = block.fontFamily;
    if (block.lineHeight) fresh.lineHeight = block.lineHeight;
    if (block.comments) fresh.comments = block.comments;
    return fresh;
  });
  commitBlocks(page.id, next);
  ui.selectedBlockId = targetId;
  ui.formatOpen = false;
  ui.listOpen = false;
  ui.colorOpen = false;
}

function insertAfterSelected(block) {
  const page = store.projectById(currentPageId());
  if (!page || isFolderItem(page)) return;
  const index = page.blocks.findIndex((item) => item.id === ui.selectedBlockId);
  const at = index >= 0 ? index + 1 : page.blocks.length;
  const blocks = [...page.blocks];
  blocks.splice(at, 0, block);
  commitBlocks(page.id, blocks);
  ui.selectedBlockId = block.id;
}

function bumpIndent(delta) {
  const page = store.projectById(currentPageId());
  if (!page || isFolderItem(page) || !ui.selectedBlockId) return;
  let nextIndent = 0;
  commitBlocks(
    page.id,
    page.blocks.map((block) => {
      if (block.id !== ui.selectedBlockId) return block;
      nextIndent = Math.min(4, Math.max(0, (block.indent || 0) + delta));
      return { ...block, indent: nextIndent };
    }),
  );
  const el = document.querySelector(`[data-block="${ui.selectedBlockId}"]`);
  if (el) el.style.paddingLeft = `${nextIndent * 28}px`;
}

function mutateTable(id, fn) {
  const page = store.projectById(currentPageId());
  if (!page || isFolderItem(page)) return;
  commitBlocks(
    page.id,
    page.blocks.map((block) => {
      if (block.id !== id || block.type !== "table") return block;
      const copy = {
        ...block,
        headers: [...(block.headers || [])],
        rows: (block.rows || []).map((row) => [...row]),
      };
      return fn(copy);
    }),
  );
}

function pickNoteImage(blockId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const page = store.projectById(currentPageId());
      if (!page) return;
      commitBlocks(
        page.id,
        page.blocks.map((block) => (block.id === blockId ? { ...block, uri: reader.result } : block)),
      );
      render();
      ui.selectedBlockId = blockId;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function applyFontSize(px) {
  const size = Math.min(42, Math.max(12, Math.round(Number(px) || 17)));
  const page = store.projectById(currentPageId());
  const targetId = ui.selectedBlockId || page?.blocks[0]?.id;
  if (!page || !targetId) return size;
  const current = page.blocks.find((block) => block.id === targetId);
  if (!current || current.type === "table" || current.type === "image" || current.type === "file" || current.type === "pdf" || current.type === "divider") {
    return size;
  }
  commitBlocks(
    page.id,
    page.blocks.map((block) => (block.id === targetId ? { ...block, fontSize: size } : block)),
  );
  const live = document.querySelector(`[data-id="${targetId}"]`);
  if (live) live.style.fontSize = `${size}px`;
  const input = document.querySelector("[data-act='note-size-input']");
  if (input && document.activeElement !== input) input.value = String(size);
  return size;
}

function applyFontFamily(id) {
  const fonts = noteFontOptions();
  const chosen = fonts.find((item) => item.id === id) || fonts[0];
  if (!chosen) return;
  const page = store.projectById(currentPageId());
  const targetId = ui.selectedBlockId || page?.blocks[0]?.id;
  if (!page || !targetId) return;
  const current = page.blocks.find((block) => block.id === targetId);
  if (!current || ["table", "image", "file", "pdf", "divider", "toc"].includes(current.type)) return;
  document.execCommand("fontName", false, chosen.id);
  commitBlocks(
    page.id,
    page.blocks.map((block) => (block.id === targetId ? { ...block, fontFamily: chosen.id } : block)),
  );
  const live = document.querySelector(`[data-id="${targetId}"]`);
  if (live) live.style.fontFamily = chosen.css;
}

function applyLineHeight(value) {
  const n = Number(value);
  if (!NOTE_LINE_HEIGHTS.includes(n)) return;
  const page = store.projectById(currentPageId());
  const targetId = ui.selectedBlockId || page?.blocks[0]?.id;
  if (!page || !targetId) return;
  const current = page.blocks.find((block) => block.id === targetId);
  if (!current || ["table", "image", "file", "pdf", "divider", "toc"].includes(current.type)) return;
  commitBlocks(
    page.id,
    page.blocks.map((block) => (block.id === targetId ? { ...block, lineHeight: n } : block)),
  );
  const live = document.querySelector(`[data-id="${targetId}"]`);
  if (live) live.style.lineHeight = String(n);
}

function applyHighlight(color) {
  const value = color || "transparent";
  document.execCommand("hiliteColor", false, value);
  document.execCommand("backColor", false, value);
  const live = document.querySelector(`[data-id="${ui.selectedBlockId}"]`);
  if (live) saveBlockFromEl(live);
  ui.highlightOpen = false;
  document.querySelector(".note-highlight-pop")?.classList.remove("open");
  document.querySelector("[data-act='note-highlight-toggle']")?.classList.remove("on");
}

function clearNoteFormat() {
  const page = store.projectById(currentPageId());
  const targetId = ui.selectedBlockId || page?.blocks[0]?.id;
  const live = document.querySelector(`[data-id="${targetId}"]`);
  if (live) {
    live.focus();
    const sel = window.getSelection();
    if (sel && sel.isCollapsed) {
      const range = document.createRange();
      range.selectNodeContents(live);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("removeFormat");
    document.execCommand("unlink");
  }
  if (!page || !targetId) return;
  commitBlocks(
    page.id,
    page.blocks.map((block) => {
      if (block.id !== targetId) return block;
      const next = { ...block };
      delete next.fontSize;
      delete next.fontFamily;
      delete next.lineHeight;
      return next;
    }),
  );
  if (live) {
    live.style.fontSize = "";
    live.style.fontFamily = "";
    live.style.lineHeight = "";
    saveBlockFromEl(live);
    placeCaretEnd(live);
  }
  const input = document.querySelector("[data-act='note-size-input']");
  if (input) input.value = String(blockFontSize(selectedBlock()));
}

function attachNoteFile(file, existingId) {
  if (!file) return;
  if (file.size > NOTE_FILE_MAX) {
    alert("8MB 이하 파일만 넣을 수 있습니다.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    const kind = isImage ? "image" : isPdf ? "pdf" : "file";
    const block = existingId ? null : store.newBlock(kind);
    if (block) {
      block.uri = reader.result;
      if (!isImage) {
        block.name = file.name;
        block.size = file.size;
        if (kind === "file") block.mime = file.type || "application/octet-stream";
      }
      insertAfterSelected(block);
      ui.selectedBlockId = block.id;
      render();
      return;
    }
    const page = store.projectById(currentPageId());
    if (!page) return;
    commitBlocks(
      page.id,
      page.blocks.map((item) =>
        item.id === existingId
          ? {
              ...item,
              uri: reader.result,
              name: file.name,
              mime: file.type || item.mime,
              size: file.size,
            }
          : item,
      ),
    );
    render();
    ui.selectedBlockId = existingId;
  };
  reader.readAsDataURL(file);
}

function pickNoteFile(existingId) {
  const input = document.createElement("input");
  input.type = "file";
  input.onchange = () => attachNoteFile(input.files?.[0], existingId);
  input.click();
}

function pickPdfFile(onFile) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.onchange = () => onFile(input.files?.[0]);
  input.click();
}

function pickNotePdf(existingId) {
  pickPdfFile((file) => attachNoteFile(file, existingId));
}

function newPageParentId() {
  if (ui.newPageParent) return ui.newPageParent;
  const current = store.projectById(ui.notePageId || currentPageId());
  const wanted = ui.newPageGroupId || groupRoute()?.groupId;
  if (wanted && inheritedGroupId(current) !== wanted) return null;
  return creationParentId(current) || null;
}

function pageCreationGroupId() {
  const parent = newPageParentId();
  const parentPage = parent ? store.projectById(parent) : null;
  const current = store.projectById(ui.notePageId || currentPageId());
  return (
    ui.newPageGroupId ||
    inheritedGroupId(parentPage) ||
    inheritedGroupId(current) ||
    groupRoute()?.groupId ||
    undefined
  );
}

function createBlankPage() {
  return store.addPage({
    name: "새로운 페이지",
    parentId: newPageParentId(),
    type: "page",
    groupId: pageCreationGroupId(),
  });
}

function pickProjectPdf() {
  pickPdfFile(importPdfAsPage);
}

function importPdfAsPage(file) {
  if (!file) return;
  if (file.size > NOTE_FILE_MAX) {
    alert("8MB 이하 파일만 넣을 수 있습니다.");
    return;
  }
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) {
    alert("PDF 파일만 불러올 수 있습니다.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const rawName = String(file.name || "").replace(/\.pdf$/i, "").trim();
    const page = store.addPage({
      name: rawName || "PDF",
      parentId: newPageParentId(),
      type: "pdf",
      groupId: pageCreationGroupId(),
      pdfUri: reader.result,
      pdfName: file.name,
      pdfSize: file.size,
      pdfPage: 1,
    });
    ui.modal = null;
    ui.newPageParent = "";
    ui.newPageGroupId = "";
    ui.pdfZoom = 1;
    openCreatedPage(page);
  };
  reader.readAsDataURL(file);
}

function pdfBytesFromUri(uri) {
  if (!uri || !uri.startsWith("data:")) return null;
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const meta = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  const bin = meta.includes(";base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function loadPdfJs() {
  if (pdfJsLib) return pdfJsLib;
  if (!pdfJsLoad) {
    pdfJsLoad = import(PDFJS_URL)
      .then((mod) => {
        const lib = mod.getDocument ? mod : mod.default;
        if (!lib?.getDocument) throw new Error("pdf.js");
        if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        pdfJsLib = lib;
        return lib;
      })
      .catch((err) => {
        pdfJsLoad = null;
        throw err;
      });
  }
  return pdfJsLoad;
}

function dropPdfDocCache() {
  pdfMountGen += 1;
  pdfPaintGen += 1;
  pdfInkDrag = null;
  pdfLastFitWidth = 0;
  unbindPdfWheel();
  if (pdfMainTask) {
    try {
      pdfMainTask.cancel();
    } catch {
      /* ignore */
    }
    pdfMainTask = null;
  }
  pdfResizeObs?.disconnect();
  pdfResizeObs = null;
  pdfDocCache.doc?.destroy?.();
  pdfDocCache = { pageId: null, doc: null, numPages: 0 };
}

function showPdfFallback(host, uri) {
  if (!host) return;
  host.classList.add("fallback");
  const box = host.querySelector("[data-pdf-fallback]");
  const iframe = box?.querySelector("iframe");
  if (iframe && uri) iframe.src = uri;
  if (box) box.hidden = false;
}

function currentPdfNum(page) {
  const total = pdfDocCache.numPages || 1;
  return Math.min(total, Math.max(1, Number(page?.pdfPage) || 1));
}

function syncPdfViewerChrome(page) {
  const host = document.querySelector("[data-pdf-viewer]");
  if (!host || host.dataset.id !== page?.id) return;
  const n = currentPdfNum(page);
  const total = pdfDocCache.numPages || 1;
  const input = host.querySelector("[data-act='pdf-page-input']");
  const label = host.querySelector("[data-pdf-total]");
  const zoom = host.querySelector("[data-pdf-zoom]");
  if (input && document.activeElement !== input) input.value = String(n);
  if (label) label.textContent = `/ ${total}`;
  if (zoom) zoom.textContent = `${Math.round((Number(ui.pdfZoom) || 1) * 100)}%`;
  host.querySelectorAll(".pdf-thumb").forEach((btn) => {
    const on = Number(btn.dataset.page) === n;
    btn.classList.toggle("on", on);
    if (on) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function buildPdfThumbs(host, numPages, current) {
  const rail = host.querySelector("[data-pdf-thumbs]");
  if (!rail) return;
  rail.innerHTML = `<div class="pdf-thumbs-head">페이지</div>${Array.from({ length: numPages }, (_, i) => {
    const n = i + 1;
    return `<button type="button" class="pdf-thumb ${n === current ? "on" : ""}" data-act="pdf-goto" data-page="${n}">
      <span class="pdf-thumb-frame"><canvas></canvas></span>
      <span class="pdf-thumb-n">${n}</span>
    </button>`;
  }).join("")}`;
}

async function paintPdfCanvas(doc, pageNumber, canvas, { maxWidth, extraScale = 1, crisp = false }) {
  if (!doc || !canvas) return;
  const pdfPage = await doc.getPage(pageNumber);
  const base = pdfPage.getViewport({ scale: 1 });
  let scale = extraScale;
  if (maxWidth && base.width) scale = (maxWidth / base.width) * extraScale;
  scale = Math.max(0.12, scale);
  const viewport = pdfPage.getViewport({ scale });
  const outputScale = crisp ? Math.min(2, window.devicePixelRatio || 1) : 1;
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const frame = canvas.closest(".pdf-thumb-frame");
  if (frame && base.width && base.height) frame.style.aspectRatio = `${base.width} / ${base.height}`;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--doc").trim() || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = pdfPage.render({
    canvasContext: ctx,
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
  });
  return task;
}

function pdfStageFitWidth(host) {
  const stage = host.querySelector(".pdf-stage");
  const raw = (stage?.clientWidth || 0) - 48;
  return raw > 80 ? raw : 0;
}

async function paintPdfMain(host) {
  const page = store.projectById(host?.dataset?.id);
  if (!page || !pdfDocCache.doc || pdfDocCache.pageId !== page.id) return;
  const canvas = host.querySelector("[data-pdf-canvas]");
  if (!canvas) return;
  const gen = ++pdfPaintGen;
  let width = pdfStageFitWidth(host);
  if (!width) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (gen !== pdfPaintGen) return;
    width = pdfStageFitWidth(host);
  }
  width = Math.max(240, width || 720);
  pdfLastFitWidth = width;
  if (pdfMainTask) {
    try {
      pdfMainTask.cancel();
    } catch {
      /* ignore */
    }
    pdfMainTask = null;
  }
  let task = null;
  try {
    task = await paintPdfCanvas(pdfDocCache.doc, currentPdfNum(page), canvas, {
      maxWidth: width,
      extraScale: Number(ui.pdfZoom) || 1,
      crisp: true,
    });
    if (gen !== pdfPaintGen) {
      try {
        task?.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    pdfMainTask = task;
    await task?.promise;
  } catch (err) {
    if (err?.name === "RenderingCancelledException") return;
    throw err;
  } finally {
    if (pdfMainTask === task) pdfMainTask = null;
  }
  if (gen !== pdfPaintGen) return;
  paintPdfInk(host);
  syncPdfTexts(host);
}

function pdfInkState() {
  return ui.pdfInk || { mode: "off", color: "#111827", width: 3.5 };
}

function pdfCanvasCssSize(canvas) {
  const cssW = canvas?.offsetWidth || parseFloat(canvas?.style.width) || 0;
  const cssH = canvas?.offsetHeight || parseFloat(canvas?.style.height) || 0;
  return { cssW, cssH };
}

function drawPdfStroke(ctx, stroke, cssW, cssH) {
  const pts = stroke?.points || [];
  if (!pts.length) return;
  ctx.strokeStyle = stroke.color || "#111827";
  ctx.lineWidth = Math.max(1, (Number(stroke.width) || 0.004) * cssW);
  ctx.beginPath();
  ctx.moveTo(pts[0].x * cssW, pts[0].y * cssH);
  if (pts.length === 1) ctx.lineTo(pts[0].x * cssW + 0.2, pts[0].y * cssH);
  else {
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * cssW, pts[i].y * cssH);
  }
  ctx.stroke();
}

function paintPdfInk(host, extraStroke) {
  const page = store.projectById(host?.dataset?.id);
  const main = host?.querySelector("[data-pdf-canvas]");
  const ink = host?.querySelector("[data-pdf-ink]");
  if (!page || !main || !ink) return;
  const { cssW, cssH } = pdfCanvasCssSize(main);
  if (!cssW || !cssH) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ink.width = Math.max(1, Math.floor(cssW * dpr));
  ink.height = Math.max(1, Math.floor(cssH * dpr));
  ink.style.width = `${Math.floor(cssW)}px`;
  ink.style.height = `${Math.floor(cssH)}px`;
  const ctx = ink.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = currentPdfNum(page);
  const strokes = [...(page.pdfAnnotations?.[n] || [])].filter((item) => item?.type !== "text");
  if (extraStroke) strokes.push(extraStroke);
  for (const stroke of strokes) drawPdfStroke(ctx, stroke, cssW, cssH);
}

function inkPointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function distToSeg(a, b, p) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function strokeNearPoint(stroke, pt, radius) {
  if (stroke?.type === "text") {
    return Math.hypot((stroke.x || 0) - pt.x, (stroke.y || 0) - pt.y) <= Math.max(radius, (stroke.fontSize || 0.022) * 1.4);
  }
  const pts = stroke?.points || [];
  for (let i = 0; i < pts.length; i += 1) {
    const dx = pts[i].x - pt.x;
    const dy = pts[i].y - pt.y;
    if (dx * dx + dy * dy <= radius * radius) return true;
    if (i && distToSeg(pts[i - 1], pts[i], pt) <= radius) return true;
  }
  return false;
}

function savePdfAnnotations(pageId, pageNumber, strokes) {
  const page = store.projectById(pageId);
  if (!page) return;
  const next = { ...(page.pdfAnnotations || {}) };
  if (strokes.length) next[pageNumber] = strokes;
  else delete next[pageNumber];
  store.updatePage(pageId, { pdfAnnotations: next });
  store.flushPersist();
}

function erasePdfInkAt(host, page, pageNumber, pt, cssW) {
  const list = [...(page.pdfAnnotations?.[pageNumber] || [])];
  const radius = Math.max(0.012, ((pdfInkState().width || 3.5) / Math.max(cssW, 1)) * 2.4);
  const next = list.filter((stroke) => !strokeNearPoint(stroke, pt, radius));
  if (next.length === list.length) return;
  savePdfAnnotations(page.id, pageNumber, next);
  paintPdfInk(host);
  syncPdfTexts(host, { force: true });
}

function finishPdfInkDrag(host, event) {
  if (!pdfInkDrag || pdfInkDrag.host !== host) return;
  const overlay = host.querySelector("[data-pdf-ink]");
  if (event && overlay) {
    try {
      overlay.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
  const drag = pdfInkDrag;
  pdfInkDrag = null;
  if (drag.mode === "pen" && drag.stroke.points.length) {
    const page = store.projectById(host.dataset.id);
    if (page) {
      const n = currentPdfNum(page);
      savePdfAnnotations(page.id, n, [...(page.pdfAnnotations?.[n] || []), drag.stroke]);
    }
  }
  paintPdfInk(host);
}

function bindPdfInk(host) {
  const overlay = host.querySelector("[data-pdf-ink]");
  if (!overlay || overlay.dataset.inkBound) return;
  overlay.dataset.inkBound = "1";
  overlay.addEventListener("pointerdown", (event) => {
    const mode = pdfInkState().mode;
    if (mode === "off") return;
    event.preventDefault();
    const pt = inkPointFromEvent(event, overlay);
    if (!pt) return;
    if (mode === "text") {
      placePdfText(host, pt);
      return;
    }
    try {
      overlay.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const page = store.projectById(host.dataset.id);
    if (!page) return;
    const n = currentPdfNum(page);
    const cssW = overlay.getBoundingClientRect().width || 1;
    if (mode === "erase") {
      pdfInkDrag = { host, mode: "erase", pointerId: event.pointerId };
      erasePdfInkAt(host, page, n, pt, cssW);
      return;
    }
    const ink = pdfInkState();
    pdfInkDrag = {
      host,
      mode: "pen",
      pointerId: event.pointerId,
      stroke: {
        id: uid("ann"),
        type: "stroke",
        points: [pt],
        color: ink.color || "#111827",
        width: Math.min(0.08, Math.max(0.0008, (Number(ink.width) || 3.5) / cssW)),
      },
    };
    paintPdfInk(host, pdfInkDrag.stroke);
  });
  overlay.addEventListener("pointermove", (event) => {
    if (!pdfInkDrag || pdfInkDrag.host !== host) return;
    if (pdfInkDrag.pointerId != null && event.pointerId !== pdfInkDrag.pointerId) return;
    const pt = inkPointFromEvent(event, overlay);
    if (!pt) return;
    const page = store.projectById(host.dataset.id);
    if (!page) return;
    const n = currentPdfNum(page);
    if (pdfInkDrag.mode === "erase") {
      erasePdfInkAt(host, page, n, pt, overlay.getBoundingClientRect().width || 1);
      return;
    }
    const last = pdfInkDrag.stroke.points[pdfInkDrag.stroke.points.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.0015) return;
    pdfInkDrag.stroke.points.push(pt);
    paintPdfInk(host, pdfInkDrag.stroke);
  });
  overlay.addEventListener("pointerup", (event) => finishPdfInkDrag(host, event));
  overlay.addEventListener("pointercancel", (event) => finishPdfInkDrag(host, event));
}

function pdfTextFontSize(cssW) {
  const width = Number(pdfInkState().width) || 3.5;
  const px = width <= 2 ? 13 : width >= 6 ? 22 : 16;
  return Math.min(0.12, Math.max(0.01, px / Math.max(cssW, 1)));
}

function flushPdfTextEditor(root = document) {
  root.querySelectorAll(".pdf-text-edit:focus").forEach((el) => el.blur());
}

function placePdfText(host, pt) {
  const page = store.projectById(host.dataset.id);
  if (!page) return;
  const n = currentPdfNum(page);
  const cssW = host.querySelector("[data-pdf-canvas]")?.offsetWidth || 800;
  const item = {
    id: uid("ann"),
    type: "text",
    x: pt.x,
    y: pt.y,
    text: "",
    color: pdfInkState().color || "#111827",
    fontSize: pdfTextFontSize(cssW),
  };
  savePdfAnnotations(page.id, n, [...(page.pdfAnnotations?.[n] || []), item]);
  syncPdfTexts(host, { force: true, focusId: item.id });
}

function commitPdfText(el, { persist = true, removeEmpty = false } = {}) {
  const host = el.closest("[data-pdf-viewer]");
  const page = store.projectById(host?.dataset?.id);
  const id = el.dataset.ann;
  if (!host || !page || !id) return;
  const n = currentPdfNum(page);
  const text = String(el.innerText || "").replace(/\u00a0/g, " ").trimEnd();
  const list = [...(page.pdfAnnotations?.[n] || [])];
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return;
  if (removeEmpty && !text.trim()) {
    list.splice(index, 1);
    savePdfAnnotations(page.id, n, list);
    syncPdfTexts(host, { force: true });
    return;
  }
  if (list[index].text === text) {
    if (persist) store.flushPersist();
    return;
  }
  list[index] = { ...list[index], type: "text", text };
  if (persist) savePdfAnnotations(page.id, n, list);
  else store.updatePage(page.id, { pdfAnnotations: { ...(page.pdfAnnotations || {}), [n]: list } });
}

function syncPdfTexts(host, { force = false, focusId = "" } = {}) {
  const layer = host?.querySelector("[data-pdf-texts]");
  const main = host?.querySelector("[data-pdf-canvas]");
  const page = store.projectById(host?.dataset?.id);
  if (!layer || !main || !page) return;
  if (!force && layer.querySelector(".pdf-text-edit:focus")) return;
  const { cssW, cssH } = pdfCanvasCssSize(main);
  if (!cssW || !cssH) return;
  const n = currentPdfNum(page);
  const items = (page.pdfAnnotations?.[n] || []).filter((item) => item?.type === "text");
  layer.style.width = `${Math.floor(cssW)}px`;
  layer.style.height = `${Math.floor(cssH)}px`;
  if (!force && layer.dataset.page === String(n) && layer.dataset.count === String(items.length)) return;
  layer.dataset.page = String(n);
  layer.dataset.count = String(items.length);
  layer.innerHTML = items
    .map(
      (item) =>
        `<div class="pdf-text" style="left:${item.x * 100}%;top:${item.y * 100}%;color:${escapeHtml(item.color || "#111827")};--pdf-fs:${item.fontSize || 0.022}">
          <div class="pdf-text-edit" contenteditable="true" data-act="pdf-text" data-ann="${item.id}" spellcheck="false">${escapeHtml(item.text || "")}</div>
        </div>`,
    )
    .join("");
  if (focusId) {
    requestAnimationFrame(() => {
      const node = layer.querySelector(`[data-ann="${focusId}"]`);
      if (!node) return;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }
}

function syncPdfInkChrome(host) {
  if (!host) return;
  const ink = pdfInkState();
  host.classList.toggle("inking", ink.mode === "pen" || ink.mode === "erase");
  host.classList.toggle("texting", ink.mode === "text");
  const overlay = host.querySelector("[data-pdf-ink]");
  if (overlay) {
    overlay.style.pointerEvents = ink.mode === "off" ? "none" : "auto";
    overlay.classList.toggle("erase", ink.mode === "erase");
    overlay.classList.toggle("text", ink.mode === "text");
  }
  host.querySelector("[data-act='pdf-ink']")?.classList.toggle("on", ink.mode === "pen");
  host.querySelector("[data-act='pdf-ink-text']")?.classList.toggle("on", ink.mode === "text");
  host.querySelector("[data-act='pdf-ink-erase']")?.classList.toggle("on", ink.mode === "erase");
  host.querySelectorAll("[data-act='pdf-ink-color']").forEach((btn) => {
    btn.classList.toggle("on", (btn.dataset.color || "").toLowerCase() === String(ink.color || "").toLowerCase());
  });
  host.querySelectorAll("[data-act='pdf-ink-width']").forEach((btn) => {
    btn.classList.toggle("on", Number(btn.dataset.width) === Number(ink.width));
  });
}

function syncPdfNotesChrome() {
  const view = document.querySelector(".pdf-view");
  if (!view) return;
  const open = Boolean(ui.pdfNotesOpen);
  const workspace = view.querySelector(".pdf-workspace");
  const panel = view.querySelector("[data-pdf-notes]");
  const btn = view.querySelector("[data-act='toggle-pdf-notes']");
  view.classList.toggle("notes-open", open);
  workspace?.classList.toggle("notes-open", open);
  if (panel) panel.hidden = !open;
  if (btn) {
    btn.classList.toggle("on", open);
    btn.setAttribute("aria-expanded", String(open));
  }
}

async function paintPdfThumbs(host, gen) {
  const page = store.projectById(host?.dataset?.id);
  if (!page || !pdfDocCache.doc || pdfDocCache.pageId !== page.id) return;
  const buttons = [...host.querySelectorAll(".pdf-thumb")];
  for (const btn of buttons) {
    if (gen !== pdfMountGen) return;
    const canvas = btn.querySelector("canvas");
    const n = Number(btn.dataset.page);
    try {
      const task = await paintPdfCanvas(pdfDocCache.doc, n, canvas, { maxWidth: 88 });
      await task?.promise;
    } catch {
      /* skip a broken thumb */
    }
  }
}

async function mountPdfViewer(host) {
  const page = store.projectById(host?.dataset?.id);
  if (!isPdfItem(page) || !page.pdfUri) {
    showPdfFallback(host, page?.pdfUri || "");
    return;
  }
  const gen = ++pdfMountGen;
  pdfResizeObs?.disconnect();
  pdfResizeObs = null;
  unbindPdfWheel();
  try {
    if (pdfDocCache.pageId !== page.id || !pdfDocCache.doc) {
      pdfDocCache.doc?.destroy?.();
      pdfDocCache = { pageId: null, doc: null, numPages: 0 };
      ui.pdfZoom = 1;
      const lib = await loadPdfJs();
      if (gen !== pdfMountGen) return;
      const bytes = pdfBytesFromUri(page.pdfUri);
      const task = bytes ? lib.getDocument({ data: bytes }) : lib.getDocument({ url: page.pdfUri });
      const doc = await task.promise;
      if (gen !== pdfMountGen) {
        doc.destroy?.();
        return;
      }
      pdfDocCache = { pageId: page.id, doc, numPages: doc.numPages || 1 };
    }
    const total = pdfDocCache.numPages || 1;
    const n = Math.min(total, Math.max(1, Number(page.pdfPage) || 1));
    if (n !== page.pdfPage) store.updatePage(page.id, { pdfPage: n });
    buildPdfThumbs(host, total, n);
    syncPdfViewerChrome({ ...page, pdfPage: n });
    bindPdfInk(host);
    syncPdfInkChrome(host);
    bindPdfWheel(host, gen);
    await paintPdfMain(host);
    if (gen !== pdfMountGen) return;
    paintPdfThumbs(host, gen);
    const stage = host.querySelector(".pdf-stage");
    if (stage && typeof ResizeObserver !== "undefined") {
      let tick = 0;
      pdfResizeObs = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        const nextWidth = Math.max(240, (box?.width || stage.clientWidth || 0) - 48);
        if (pdfLastFitWidth && Math.abs(nextWidth - pdfLastFitWidth) < 8) return;
        clearTimeout(tick);
        tick = setTimeout(() => {
          if (gen !== pdfMountGen) return;
          if (document.querySelector("[data-pdf-viewer]") === host) paintPdfMain(host).catch(() => {});
        }, 80);
      });
      pdfResizeObs.observe(stage);
    }
  } catch {
    if (gen !== pdfMountGen) return;
    showPdfFallback(host, page.pdfUri);
  }
}

function unbindPdfWheel() {
  pdfWheelOff?.();
  pdfWheelOff = null;
  pdfWheelAcc = 0;
  pdfWheelArmed = true;
  clearTimeout(pdfWheelIdle);
  pdfWheelIdle = 0;
}

function pdfWheelDeltaY(event, pane) {
  const dy = Number(event.deltaY) || 0;
  if (event.deltaMode === 1) return dy * 16;
  if (event.deltaMode === 2) return dy * (pane?.clientHeight || 800);
  return dy;
}

function bindPdfWheel(host, gen) {
  unbindPdfWheel();
  const pane = host.querySelector("[data-pdf-main]");
  if (!pane) return;
  const onWheel = (event) => {
    if (gen !== pdfMountGen) return;
    if (document.querySelector("[data-pdf-viewer]") !== host) return;
    if (event.ctrlKey || event.metaKey) return;
    if (pdfInkDrag) return;
    const dy = pdfWheelDeltaY(event, pane);
    if (!dy) return;
    const atTop = pane.scrollTop <= 1;
    const atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
    const towardNext = dy > 0;
    if ((towardNext && !atBottom) || (!towardNext && !atTop)) {
      pdfWheelAcc = 0;
      pdfWheelArmed = true;
      return;
    }
    event.preventDefault();
    if (!pdfWheelArmed) {
      clearTimeout(pdfWheelIdle);
      pdfWheelIdle = setTimeout(() => {
        pdfWheelArmed = true;
        pdfWheelAcc = 0;
      }, 220);
      return;
    }
    pdfWheelAcc += dy;
    clearTimeout(pdfWheelIdle);
    pdfWheelIdle = setTimeout(() => {
      pdfWheelAcc = 0;
    }, 180);
    if (Math.abs(pdfWheelAcc) < 72) return;
    const dir = pdfWheelAcc > 0 ? 1 : -1;
    pdfWheelAcc = 0;
    pdfWheelArmed = false;
    pdfWheelIdle = setTimeout(() => {
      pdfWheelArmed = true;
    }, 280);
    const page = store.projectById(host.dataset.id);
    if (!isPdfItem(page)) return;
    setPdfViewPage(currentPdfNum(page) + dir, { fromWheel: true });
  };
  pane.addEventListener("wheel", onWheel, { passive: false });
  pdfWheelOff = () => pane.removeEventListener("wheel", onWheel);
}

function setPdfViewPage(next, { fromWheel = false } = {}) {
  const host = document.querySelector("[data-pdf-viewer]");
  flushPdfTextEditor(host);
  const page = store.projectById(host?.dataset?.id);
  if (!isPdfItem(page)) return;
  const total = pdfDocCache.numPages || 1;
  const n = Math.min(total, Math.max(1, Math.round(Number(next) || 1)));
  if (n === currentPdfNum(page)) {
    syncPdfViewerChrome(page);
    return;
  }
  const dir = n - currentPdfNum(page);
  store.updatePage(page.id, { pdfPage: n });
  const live = store.projectById(page.id);
  syncPdfViewerChrome(live);
  paintPdfMain(host)
    .then(() => {
      const pane = host.querySelector("[data-pdf-main]");
      if (!pane) return;
      pane.scrollTop = fromWheel && dir < 0 ? pane.scrollHeight : 0;
    })
    .catch(() => showPdfFallback(host, page.pdfUri));
}

function nudgePdfZoom(dir) {
  const host = document.querySelector("[data-pdf-viewer]");
  const page = store.projectById(host?.dataset?.id);
  if (!isPdfItem(page)) return;
  const cur = Number(ui.pdfZoom) || 1;
  const next = Math.min(3, Math.max(0.5, Math.round((cur + dir * 0.25) * 100) / 100));
  if (next === cur) return;
  ui.pdfZoom = next;
  syncPdfViewerChrome(page);
  paintPdfMain(host).catch(() => showPdfFallback(host, page.pdfUri));
}

function openProjectPage(page) {
  ui.notePageId = page?.id || null;
  if (parseHash().name === "focus") {
    render();
    return;
  }
  const groupId = inheritedGroupId(page);
  go(groupId ? groupPath(groupId, "projects", page.id) : `/projects/${page.id}`);
}

function openProjectsRoot() {
  ui.notePageId = null;
  if (parseHash().name === "focus") {
    render();
    return;
  }
  const ctx = groupRoute();
  go(ctx?.groupId ? groupPath(ctx.groupId, "projects") : "/projects");
}

function openCreatedPage(page) {
  if (parseHash().name === "focus") {
    ui.notePageId = page.id;
    render();
    requestAnimationFrame(() => document.querySelector(".page-name")?.focus());
    return;
  }
  openProjectPage(page);
}

function onClick(event) {
  const actEl = event.target.closest("[data-act]");
  if (event.target.closest(".modal") && event.target.closest("[data-stop]")) {
    /* keep */
  } else if (event.target.closest("[data-act='close-modal']")) {
    if (!auth.user() || ui.deletingAccount) return;
    ui.modal = null;
    resetCourseDrafts();
    ui.editingTaskId = null;
    ui.eventId = null;
    ui.pollGroupId = null;
    ui.pollEditId = null;
    ui.pollMenu = null;
    ui.newPageParent = "";
    ui.newPageGroupId = "";
    ui.searchQuery = "";
    ui.searchHits = [];
    render();
    return;
  }
  const noteLink = event.target.closest(".note-editor a[href]");
  if (
    noteLink &&
    !noteLink.hasAttribute("data-stop") &&
    !event.target.closest("[data-act]")?.dataset?.act?.startsWith("note") &&
    !event.target.closest(".note-comment-pop")
  ) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      event.preventDefault();
      window.open(noteLink.href, "_blank", "noopener,noreferrer");
      return;
    }
  }
  if (!actEl) {
    if (ui.panel && !event.target.closest(".bell-wrap")) {
      ui.panel = false;
      render();
    } else if (ui.toolsOpen && !event.target.closest(".tools-wrap")) {
      ui.toolsOpen = false;
      render();
    } else if (ui.openTaskMenu && !event.target.closest(".task-menu-wrap")) {
      ui.openTaskMenu = null;
      render();
    } else if (ui.colorOpen || ui.highlightOpen) {
      if (!event.target.closest(".note-color-wrap")) {
        ui.colorOpen = false;
        ui.highlightOpen = false;
        document.querySelectorAll(".note-color-pop").forEach((el) => el.classList.remove("open"));
        document.querySelector("[data-act='note-color-toggle']")?.classList.remove("on");
        document.querySelector("[data-act='note-highlight-toggle']")?.classList.remove("on");
      }
    } else if (ui.emojiOpen && !event.target.closest(".note-emoji-pop") && !event.target.closest("[data-act='note-emoji-toggle']")) {
      ui.emojiOpen = false;
      document.querySelector(".note-emoji-pop")?.classList.remove("open");
      document.querySelector("[data-act='note-emoji-toggle']")?.classList.remove("on");
    } else if (ui.timetableMenu && !event.target.closest(".tt-switch-more")) {
      ui.timetableMenu = false;
      render();
    } else if (ui.pollMenu && !event.target.closest(".poll-card-more")) {
      ui.pollMenu = null;
      render();
    } else if (ui.docTabMenu && !event.target.closest(".doc-tab")) {
      ui.docTabMenu = null;
      render();
    } else if (ui.commentBlockId && !event.target.closest(".note-comment-pop") && !event.target.closest("[data-act='toggle-comment']")) {
      ui.commentBlockId = null;
      render();
    } else if (ui.noteMoreOpen && !event.target.closest(".note-more-wrap")) {
      ui.noteMoreOpen = false;
      ui.colorOpen = false;
      ui.highlightOpen = false;
      ui.emojiOpen = false;
      render();
    }
    return;
  }
  const act = actEl.dataset.act;
  const id = actEl.dataset.id;
  if (act === "toggle-ampm") {
    event.preventDefault();
    toggleAmPm(actEl);
    return;
  }
  if (ui.openTaskMenu && act !== "task-menu" && !event.target.closest(".task-menu-wrap")) {
    ui.openTaskMenu = null;
  }
  if (ui.timetableMenu && act !== "tt-menu" && !event.target.closest(".tt-switch-more")) {
    ui.timetableMenu = false;
  }
  if (ui.pollMenu && act !== "poll-menu" && !event.target.closest(".poll-card-more")) {
    ui.pollMenu = null;
  }
  if (act === "toggle-task") {
    store.toggleTask(id);
    const task = store.getState().tasks.find((item) => item.id === id);
    if (task?.groupId) {
      auth.updateGroupTask(task.id, { status: task.status }).catch(() => {
        alert("할 일 저장에 실패했어요. 다시 시도해 주세요.");
      });
    }
  }
  else if (act === "task-menu") {
    ui.openTaskMenu = ui.openTaskMenu === id ? null : id;
  } else if (act === "edit-task") {
    ui.openTaskMenu = null;
    ui.modal = "task-edit";
    ui.editingTaskId = id;
  }   else if (act === "del-task") {
    ui.openTaskMenu = null;
    if (!confirm("이 할 일을 삭제할까요?")) {
      render();
      return;
    }
    const task = store.getState().tasks.find((item) => item.id === id);
    store.deleteTask(id);
    if (task?.groupId) {
      auth.deleteGroupTask(task.id).catch(() => {
        alert("할 일 저장에 실패했어요. 다시 시도해 주세요.");
      });
    }
  } else if (act === "toggle-subtask") {
    store.toggleSubtask(id, actEl.dataset.sub);
  } else if (act === "del-subtask") {
    store.deleteSubtask(id, actEl.dataset.sub);
  } else if (act === "add-subtask") {
    const input = actEl.closest(".subtask-add")?.querySelector("[data-act='subtask-title']");
    store.addSubtask(id, input?.value);
    if (input) input.value = "";
  }
  else if (act === "play-task") return playTask(id);
  else if (act === "date-prev") shiftDate(actEl.dataset.which, -1);
  else if (act === "date-next") shiftDate(actEl.dataset.which, 1);
  else if (act === "date-today") {
    if (actEl.dataset.which === "timeline") ui.timeline = new Date();
    else {
      ui.date = new Date();
      maybeMaterializeToday();
    }
  } else if (act === "go-deadline") {
    const groupId = actEl.dataset.group;
    go(groupId ? groupPath(groupId, "tasks") : "/today");
    return;
  } else if (act === "go-categories") {
    go("/categories");
    return;
  } else if (act === "pause") store.pauseTimer();
  else if (act === "resume") store.resumeTimer();
  else if (act === "finish") {
    const s = store.getState();
    const task = s.tasks.find((item) => item.id === s.activeTimer?.taskId);
    if (!task) return;
    if (!confirm("측정한 집중시간을 저장할까요?")) return;
    store.finishTimer(task.title, task.categoryId);
    go("/timeline");
  } else if (act === "cancel") {
    if (!confirm("측정 기록을 저장하지 않을까요?")) return;
    store.cancelTimer();
    go("/today");
  } else if (act === "aux-min") ui.auxMinutes = actEl.dataset.min;
  else if (act === "aux-start") {
    const minutes = Math.min(720, Math.max(1, Number(ui.auxMinutes) || 30));
    store.startAuxiliary(minutes * 60);
  } else if (act === "aux-pause") store.pauseAuxiliary();
  else if (act === "aux-resume") store.resumeAuxiliary();
  else if (act === "aux-stop") store.stopAuxiliary();
  else if (act === "del-session") {
    if (confirm("이 기록을 삭제할까요?")) store.deleteSession(id);
  } else if (act === "month-prev") ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1);
  else if (act === "month-next") ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1);
  else if (act === "cal-today") {
    ui.date = new Date();
    ui.month = new Date(ui.date.getFullYear(), ui.date.getMonth(), 1);
    maybeMaterializeToday();
  } else if (act === "pick-day") {
    const [y, m, d] = actEl.dataset.key.split("-").map(Number);
    ui.date = new Date(y, m - 1, d);
    maybeMaterializeToday();
  } else if (act === "del-event") {
    store.deleteEvent(id);
    if (ui.modal === "event-detail") {
      ui.modal = null;
      ui.eventId = null;
    }
  } else if (act === "show-event") {
    ui.eventId = id;
    ui.modal = "event-detail";
  } else if (act === "open-course") {
    ui.courseId = null;
    ui.courseSlotsDraft = [defaultCourseSlot()];
    ui.courseColorDraft = store.getState().categories[0]?.color || "#0EA5E9";
    ui.courseFormDraft = { title: "", professor: "", room: "", memo: "" };
    ui.courseDeleteConfirm = false;
    ui.modal = "course";
  } else if (act === "edit-course") {
    const course = store.courseById(id);
    ui.courseId = id;
    ui.courseSlotsDraft = store.courseSlots(course);
    ui.courseColorDraft = course?.color || store.getState().categories[0]?.color || "#0EA5E9";
    ui.courseFormDraft = {
      title: course?.title || "",
      professor: course?.professor || "",
      room: course?.room || "",
      memo: course?.memo || "",
    };
    ui.courseDeleteConfirm = false;
    ui.modal = "course";
  } else if (act === "add-course-slot") {
    snapshotCourseForm();
    ui.courseSlotsDraft = [...(ui.courseSlotsDraft?.length ? ui.courseSlotsDraft : [defaultCourseSlot()]), defaultCourseSlot()];
  } else if (act === "del-course-slot") {
    snapshotCourseForm();
    const idx = Number(actEl.dataset.idx);
    if ((ui.courseSlotsDraft || []).length > 1) {
      ui.courseSlotsDraft = ui.courseSlotsDraft.filter((_, i) => i !== idx);
    }
  } else if (act === "pick-course-color") {
    applyCourseColorDraft(actEl.dataset.color);
    return;
  } else if (act === "save-course-preset") {
    snapshotCourseForm();
    store.addCoursePresetColor(ui.courseColorDraft || document.querySelector("form[data-act='add-course'] [name='color']")?.value);
  } else if (act === "del-course-preset") {
    snapshotCourseForm();
    store.removeCoursePresetColor(actEl.dataset.color);
  } else if (act === "ask-del-course") {
    snapshotCourseForm();
    ui.courseDeleteConfirm = true;
  } else if (act === "cancel-del-course") {
    ui.courseDeleteConfirm = false;
  } else if (act === "confirm-del-course") {
    const courseId = ui.courseId || id;
    if (courseId) store.deleteCourse(courseId);
    ui.modal = null;
    resetCourseDrafts();
    maybeSyncTimetable();
  } else if (act === "tt-tab") {
    ui.timetableTab = actEl.dataset.tab === "gpa" ? "gpa" : "grid";
    ui.timetableMenu = false;
  } else if (act === "select-timetable") {
    ui.timetableId = id;
    ui.timetableMenu = false;
  } else if (act === "tt-menu") {
    ui.timetableMenu = !ui.timetableMenu;
    if (ui.timetableMenu) dismissTtMenuHint();
  } else if (act === "add-timetable") {
    ui.timetableMenu = false;
    const name = prompt("시간표 이름", "새 시간표");
    if (name === null) {
      render();
      return;
    }
    const tt = store.addTimetable(name);
    ui.timetableId = tt.id;
  } else if (act === "rename-timetable") {
    ui.timetableMenu = false;
    const current = store.getTimetables().find((item) => item.id === id);
    const name = prompt("시간표 이름", current?.name || "");
    if (name === null) {
      render();
      return;
    }
    store.renameTimetable(id, name);
  } else if (act === "duplicate-timetable") {
    ui.timetableMenu = false;
    const current = store.getTimetables().find((item) => item.id === id);
    const name = prompt("시간표 이름", `${current?.name || "시간표"} 복사`);
    if (name === null) {
      render();
      return;
    }
    const tt = store.duplicateTimetable(id, name);
    if (tt) ui.timetableId = tt.id;
  } else if (act === "set-primary-timetable") {
    ui.timetableMenu = false;
    store.setPrimaryTimetable(id);
    maybeSyncTimetable();
  } else if (act === "del-timetable") {
    ui.timetableMenu = false;
    const list = store.getTimetables();
    if (list.length <= 1) {
      alert("마지막 시간표는 삭제할 수 없습니다.");
      render();
      return;
    }
    const current = list.find((item) => item.id === id);
    if (!confirm(`"${current?.name || "시간표"}"를 삭제할까요? 안의 수업도 함께 삭제됩니다.`)) {
      render();
      return;
    }
    const wasPrimary = id === store.getState().primaryTimetableId;
    if (!store.deleteTimetable(id)) return;
    const next = store.getTimetables();
    ui.timetableId = next.some((item) => item.id === ui.timetableId)
      ? ui.timetableId
      : store.getState().primaryTimetableId || next[0]?.id || "";
    if (wasPrimary) maybeSyncTimetable();
  } else if (act === "gpa-semester") ui.gpaSemester = actEl.dataset.semester || "";
  else if (act === "toggle-grade-major") {
    const row = (store.getState().gradeRecords || []).find((item) => item.id === id);
    if (row) store.updateGradeRecord(id, { isMajor: !row.isMajor });
  } else if (act === "del-grade") store.deleteGradeRecord(id);
  else if (act === "open-page") {
    const page = store.projectById(id);
    if (parseHash().name === "focus") {
      ui.notePageId = id;
      render();
      return;
    }
    if (page) openProjectPage(page);
    else go(`/projects/${id}`);
    return;
  } else if (act === "open-projects-root") {
    openProjectsRoot();
    return;
  } else if (act === "new-page") {
    const current = store.projectById(ui.notePageId || currentPageId());
    ui.newPageParent = actEl.dataset.parent || creationParentId(current) || "";
    ui.newPageGroupId = actEl.dataset.group || inheritedGroupId(current) || groupRoute()?.groupId || "";
    ui.modal = "new-page-choice";
    render();
    return;
  } else if (act === "new-page-blank") {
    ui.modal = null;
    const page = createBlankPage();
    ui.newPageParent = "";
    ui.newPageGroupId = "";
    openCreatedPage(page);
    return;
  } else if (act === "new-page-pdf") {
    pickProjectPdf();
    return;
  } else if (act === "pdf-goto") {
    setPdfViewPage(Number(actEl.dataset.page));
    return;
  } else if (act === "pdf-prev") {
    const host = document.querySelector("[data-pdf-viewer]");
    const page = store.projectById(host?.dataset?.id);
    setPdfViewPage(currentPdfNum(page) - 1);
    return;
  } else if (act === "pdf-next") {
    const host = document.querySelector("[data-pdf-viewer]");
    const page = store.projectById(host?.dataset?.id);
    setPdfViewPage(currentPdfNum(page) + 1);
    return;
  } else if (act === "pdf-zoom-in") {
    nudgePdfZoom(1);
    return;
  } else if (act === "pdf-zoom-out") {
    nudgePdfZoom(-1);
    return;
  } else if (act === "toggle-pdf-notes") {
    ui.pdfNotesOpen = !ui.pdfNotesOpen;
    syncPdfNotesChrome();
    if (ui.pdfNotesOpen) {
      requestAnimationFrame(() => document.querySelector("[data-act='pdf-notes']")?.focus());
    }
    return;
  } else if (act === "pdf-ink") {
    const ink = pdfInkState();
    ui.pdfInk = { ...ink, mode: ink.mode === "pen" ? "off" : "pen" };
    syncPdfInkChrome(document.querySelector("[data-pdf-viewer]"));
    return;
  } else if (act === "pdf-ink-text") {
    const ink = pdfInkState();
    ui.pdfInk = { ...ink, mode: ink.mode === "text" ? "off" : "text" };
    syncPdfInkChrome(document.querySelector("[data-pdf-viewer]"));
    return;
  } else if (act === "pdf-ink-erase") {
    const ink = pdfInkState();
    ui.pdfInk = { ...ink, mode: ink.mode === "erase" ? "off" : "erase" };
    syncPdfInkChrome(document.querySelector("[data-pdf-viewer]"));
    return;
  } else if (act === "pdf-ink-color") {
    const ink = pdfInkState();
    ui.pdfInk = {
      ...ink,
      color: actEl.dataset.color || "#111827",
      mode: ink.mode === "off" ? "pen" : ink.mode,
    };
    syncPdfInkChrome(document.querySelector("[data-pdf-viewer]"));
    return;
  } else if (act === "pdf-ink-width") {
    ui.pdfInk = { ...pdfInkState(), width: Number(actEl.dataset.width) || 3.5 };
    syncPdfInkChrome(document.querySelector("[data-pdf-viewer]"));
    return;
  } else if (act === "new-folder") {
    const name = prompt("폴더 이름");
    if (!name) return;
    const current = store.projectById(ui.notePageId || currentPageId());
    const parent = actEl.dataset.parent || creationParentId(current);
    const parentPage = parent ? store.projectById(parent) : null;
    const folder = store.addPage({
      name,
      parentId: parent,
      type: "folder",
      icon: "F",
      groupId:
        actEl.dataset.group ||
        inheritedGroupId(parentPage) ||
        inheritedGroupId(current) ||
        groupRoute()?.groupId,
    });
    openCreatedPage(folder);
    return;
  } else if (act === "del-page") {
    const target = store.projectById(id);
    const folder = isFolderItem(target);
    if (!confirm(folder ? "이 폴더와 안의 모든 항목을 삭제할까요?" : "이 페이지를 삭제할까요?")) return;
    const parentId = target?.parentId || null;
    const scope = target?.groupId || groupRoute()?.groupId || null;
    store.deletePage(id);
    const parent = parentId ? store.projectById(parentId) : null;
    const next =
      parent ||
      store.getState().projects.find((page) => (page.groupId || null) === scope && !page.parentId) ||
      null;
    ui.notePageId = next?.id || null;
    if (parseHash().name === "focus") {
      render();
      return;
    }
    if (next) openProjectPage(next);
    else go(scope ? groupPath(scope, "projects") : "/projects");
    return;
  } else if (act === "add-doc-tab") {
    store.addPageTab(id);
    ui.selectedBlockId = null;
    ui.commentBlockId = null;
    ui.docTabMenu = null;
    ui.renamingTabId = null;
    render();
    return;
  } else if (act === "toggle-doc-tabs") {
    ui.docTabsCollapsed = !ui.docTabsCollapsed;
    render();
    return;
  } else if (act === "set-doc-tab") {
    switchDocTab(id, actEl.dataset.tab);
    render();
    return;
  } else if (act === "doc-tab-menu") {
    ui.docTabMenu = ui.docTabMenu === actEl.dataset.tab ? null : actEl.dataset.tab;
    render();
    return;
  } else if (act === "start-rename-doc-tab") {
    ui.renamingTabId = actEl.dataset.tab;
    ui.docTabMenu = null;
    render();
    requestAnimationFrame(() => {
      const input = document.querySelector("[data-act='rename-doc-tab']");
      input?.focus();
      input?.select();
    });
    return;
  } else if (act === "del-doc-tab") {
    const page = store.projectById(id);
    if ((page?.tabs || []).length <= 1) {
      alert("마지막 탭은 삭제할 수 없습니다.");
      ui.docTabMenu = null;
      render();
      return;
    }
    if (!confirm("이 탭을 삭제할까요?")) {
      ui.docTabMenu = null;
      render();
      return;
    }
    store.deletePageTab(id, actEl.dataset.tab);
    ui.selectedBlockId = null;
    ui.docTabMenu = null;
    ui.renamingTabId = null;
    render();
    return;
  } else if (act === "note-mark") {
    document.execCommand(actEl.dataset.cmd, false, null);
    const live = document.querySelector(`[data-id="${ui.selectedBlockId}"]`);
    if (live) {
      persistHostAlign(live);
      saveBlockFromEl(live);
    }
    return;
  } else if (act === "note-color-toggle") {
    ui.colorOpen = !ui.colorOpen;
    ui.highlightOpen = false;
    ui.emojiOpen = false;
    const pop = actEl.closest(".note-color-wrap")?.querySelector(".note-color-pop");
    pop?.classList.toggle("open", ui.colorOpen);
    document.querySelector(".note-highlight-pop")?.classList.remove("open");
    document.querySelector(".note-emoji-pop")?.classList.remove("open");
    actEl.classList.toggle("on", ui.colorOpen);
    document.querySelector("[data-act='note-highlight-toggle']")?.classList.remove("on");
    document.querySelector("[data-act='note-emoji-toggle']")?.classList.remove("on");
    if (ui.colorOpen) placeNotePop(pop, actEl);
    return;
  } else if (act === "note-highlight-toggle") {
    ui.highlightOpen = !ui.highlightOpen;
    ui.colorOpen = false;
    ui.emojiOpen = false;
    const pop = document.querySelector(".note-highlight-pop");
    pop?.classList.toggle("open", ui.highlightOpen);
    document.querySelector("[data-act='note-color-toggle']")?.closest(".note-color-wrap")?.querySelector(".note-color-pop")?.classList.remove("open");
    document.querySelector(".note-emoji-pop")?.classList.remove("open");
    actEl.classList.toggle("on", ui.highlightOpen);
    document.querySelector("[data-act='note-color-toggle']")?.classList.remove("on");
    document.querySelector("[data-act='note-emoji-toggle']")?.classList.remove("on");
    if (ui.highlightOpen) placeNotePop(pop, actEl);
    return;
  } else if (act === "note-highlight") {
    applyHighlight(actEl.dataset.color);
    return;
  } else if (act === "note-clear-format") {
    clearNoteFormat();
    return;
  } else if (act === "note-color") {
    const color = actEl.dataset.color;
    if (color) document.execCommand("foreColor", false, color);
    const live = document.querySelector(`[data-id="${ui.selectedBlockId}"]`);
    if (live) saveBlockFromEl(live);
    ui.colorOpen = false;
    document.querySelector(".note-color-pop")?.classList.remove("open");
    document.querySelector("[data-act='note-color-toggle']")?.classList.remove("on");
    return;
  } else if (act === "note-undo") {
    undoNote();
    return;
  } else if (act === "note-redo") {
    redoNote();
    return;
  } else if (act === "note-find") {
    ui.findOpen = !ui.findOpen;
    ui.emojiOpen = false;
    render();
    requestAnimationFrame(() => document.querySelector("[data-act='find-q']")?.focus());
    return;
  } else if (act === "find-next") {
    findNextMatch();
    return;
  } else if (act === "find-replace-all") {
    replaceAllMatches();
    return;
  } else if (act === "find-close") {
    ui.findOpen = false;
    render();
    return;
  } else if (act === "note-link") {
    applyNoteLink();
    return;
  } else if (act === "note-emoji-toggle") {
    ui.emojiOpen = !ui.emojiOpen;
    ui.colorOpen = false;
    ui.highlightOpen = false;
    const pop = document.querySelector(".note-emoji-pop");
    pop?.classList.toggle("open", ui.emojiOpen);
    document.querySelector("[data-act='note-color-toggle']")?.closest(".note-color-wrap")?.querySelector(".note-color-pop")?.classList.remove("open");
    document.querySelector(".note-highlight-pop")?.classList.remove("open");
    actEl.classList.toggle("on", ui.emojiOpen);
    document.querySelector("[data-act='note-color-toggle']")?.classList.remove("on");
    document.querySelector("[data-act='note-highlight-toggle']")?.classList.remove("on");
    if (ui.emojiOpen) placeNotePop(pop, actEl);
    return;
  } else if (act === "note-emoji") {
    insertAtCaret(actEl.dataset.emoji || "");
    ui.emojiOpen = false;
    document.querySelector(".note-emoji-pop")?.classList.remove("open");
    return;
  } else if (act === "note-date") {
    insertAtCaret(formatKoreanDate(new Date()));
    return;
  } else if (act === "note-toc") {
    insertAfterSelected(store.newBlock("toc"));
    render();
    return;
  } else if (act === "note-paste-plain") {
    ui.pastePlain = !ui.pastePlain;
    actEl.classList.toggle("on", ui.pastePlain);
    return;
  } else if (act === "jump-block") {
    document.querySelector(`[data-block="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  } else if (act === "toggle-comment") {
    ui.commentBlockId = ui.commentBlockId === id ? null : id;
    ui.commentDraft = "";
    render();
    requestAnimationFrame(() => document.querySelector(".note-comment-form input")?.focus());
    return;
  } else if (act === "del-comment") {
    const page = store.projectById(currentPageId());
    if (!page) return;
    commitBlocks(
      page.id,
      page.blocks.map((block) =>
        block.id === id
          ? { ...block, comments: (block.comments || []).filter((item) => item.id !== actEl.dataset.cid) }
          : block,
      ),
    );
    render();
    return;
  } else if (act === "note-style") {
    applyNoteStyle(actEl.dataset.type);
    const keep = ui.selectedBlockId;
    render();
    refocusBlock(keep);
    return;
  } else if (act === "note-check") {
    const cur = selectedBlock();
    applyNoteStyle(cur?.type === "checklist" ? "paragraph" : "checklist");
    const keep = ui.selectedBlockId;
    render();
    refocusBlock(keep);
    return;
  } else if (act === "note-table") {
    const cur = selectedBlock();
    if (cur?.type === "table") {
      mutateTable(cur.id, (block) => {
        block.rows.push((block.headers || []).map(() => ""));
        return block;
      });
    } else {
      insertAfterSelected(store.newBlock("table"));
    }
    const keep = ui.selectedBlockId;
    render();
    refocusBlock(keep);
    return;
  } else if (act === "note-indent") {
    bumpIndent(1);
    return;
  } else if (act === "note-outdent") {
    bumpIndent(-1);
    return;
  } else if (act === "note-photo") {
    const image = store.newBlock("image");
    insertAfterSelected(image);
    render();
    pickNoteImage(image.id);
    return;
  } else if (act === "note-pdf") {
    const pdf = store.newBlock("pdf");
    insertAfterSelected(pdf);
    render();
    pickNotePdf(pdf.id);
    return;
  } else if (act === "pick-pdf") {
    pickNotePdf(id);
    return;
  } else if (act === "toggle-pdf") {
    const page = store.projectById(currentPageId());
    if (!page || isFolderItem(page)) return;
    commitBlocks(
      page.id,
      page.blocks.map((block) => (block.id === id && block.type === "pdf" ? { ...block, collapsed: !block.collapsed } : block)),
    );
    render();
    return;
  } else if (act === "note-file") {
    pickNoteFile();
    return;
  } else if (act === "pick-file") {
    pickNoteFile(id);
    return;
  } else if (act === "note-size") {
    applyFontSize(actEl.dataset.size);
    return;
  } else if (act === "note-size-bump") {
    applyFontSize(blockFontSize(selectedBlock()) + Number(actEl.dataset.delta));
    return;
  } else if (act === "table-add-row") {
    mutateTable(id, (block) => {
      block.rows.push((block.headers || []).map(() => ""));
      return block;
    });
  } else if (act === "table-add-col") {
    mutateTable(id, (block) => {
      block.headers.push("");
      block.rows.forEach((row) => row.push(""));
      return block;
    });
  } else if (act === "table-del-row") {
    mutateTable(id, (block) => {
      if (block.rows.length > 1) block.rows.pop();
      return block;
    });
  } else if (act === "check-block") {
    const page = store.projectById(currentPageId());
    if (!page || isFolderItem(page)) return;
    commitBlocks(
      page.id,
      page.blocks.map((block) => (block.id === id ? { ...block, checked: !block.checked } : block)),
    );
  } else if (act === "toggle-block") {
    const page = store.projectById(currentPageId());
    if (!page || isFolderItem(page)) return;
    commitBlocks(
      page.id,
      page.blocks.map((block) => (block.id === id ? { ...block, open: !block.open } : block)),
    );
  } else if (act === "pick-image") {
    pickNoteImage(id);
    return;
  } else if (act === "new-group") {
    if (!requireLoginForGroups()) {
      /* blocked */
    } else {
      const name = prompt("그룹 이름");
      if (!name) return;
      auth
        .createGroup(name)
        .then((result) => {
          if (!result?.group) throw new Error("empty-group");
          store.upsertGroup(result.group);
          syncGroupJoinAlerts(store.getState().groups);
          go(`/groups/${result.group.id}`);
          render();
        })
        .catch(() => {
          alert("그룹을 만들지 못했어요. 잠시 후 다시 시도해주세요.");
        });
      return;
    }
  } else if (act === "join-group") {
    if (!requireLoginForGroups()) {
      /* blocked */
    } else if (store.getState().settings?.rejectGroupInvites) {
      alert("초대를 거부하도록 설정되어 있습니다. 참여하려면 개인정보 보호 설정을 먼저 꺼주세요");
    } else {
      const code = prompt("초대 코드");
      if (!code) return;
      auth
        .joinGroup(code)
        .then((result) => {
          if (!result?.ok || !result?.group) {
            alert(
              result?.reason === "full"
                ? "정원이 가득 찼습니다."
                : "코드를 찾을 수 없습니다.",
            );
            return;
          }
          store.upsertGroup(result.group);
          syncGroupJoinAlerts(store.getState().groups);
          go(`/groups/${result.group.id}`);
          render();
        })
        .catch(() => {
          alert("그룹에 참여하지 못했어요. 코드를 확인해주세요.");
        });
      return;
    }
  } else if (act === "leave-group") {
    auth
      .leaveGroup(id)
      .then(() => {
        store.leaveGroup(id);
        go("/groups");
        render();
      })
      .catch(() => {
        alert("그룹에서 나가지 못했어요. 잠시 후 다시 시도해주세요.");
      });
    return;
  } else if (act === "settings-tab") ui.settingsTab = actEl.dataset.tab || "account";
  else if (act === "set-theme-mode") {
    store.updateSettings({ themeMode: themeModeValue(actEl.dataset.mode) });
    applyAppearance();
  } else if (act === "set-font-size") {
    store.updateSettings({ fontSize: actEl.dataset.size || "md" });
    applyAppearance();
  } else if (act === "set-font-family") {
    store.updateSettings({ fontFamily: actEl.dataset.family || "pretendard" });
    applyAppearance();
  } else if (act === "set-theme") {
    applyPlainTheme(actEl.dataset.color || "#2563eb");
  } else if (act === "set-school-theme") {
    const school = SCHOOL_THEME_PRESETS.find((item) => item.id === actEl.dataset.id);
    const color = themeHex(actEl.dataset.color || school?.color);
    store.updateSettings({
      themeColor: color,
      themeSchool: school?.id || actEl.dataset.id || null,
      themeBgTint: true,
    });
    applyAppearance();
  } else if (act === "save-theme-preset") {
    const color = themeHex(document.querySelector("[data-act='theme-color-pick']")?.value || store.getState().settings?.themeColor);
    store.addThemePreset(color);
    applyPlainTheme(color);
  } else if (act === "del-theme-preset") {
    store.removeThemePreset(actEl.dataset.color);
  } else if (act === "group-tab") {
    const tab = GROUP_TABS.includes(actEl.dataset.tab) ? actEl.dataset.tab : "tasks";
    const groupId = actEl.dataset.group || groupRoute()?.groupId || parseHash().id;
    ui.groupTab = tab;
    if (tab === "schedule") refreshGroupBundle();
    if (groupId) {
      go(groupPath(groupId, tab));
      return;
    }
  } else if (act === "open-poll") {
    if (!requireLoginForGroups()) {
      /* blocked */
    } else {
      ui.pollGroupId = id;
      ui.modal = "poll";
    }
  } else if (act === "toggle-poll-slot") {
    togglePollSlot(actEl.dataset.poll, actEl.dataset.slot);
    return;
  } else if (act === "poll-menu") {
    ui.pollMenu = ui.pollMenu === id ? null : id;
  } else if (act === "rename-poll") {
    ui.pollMenu = null;
    ui.pollEditId = id;
    ui.modal = "poll-rename";
  } else if (act === "del-poll") {
    ui.pollMenu = null;
    const poll = remotePolls.find((item) => item.id === id);
    if (!confirm(`"${poll?.title || "약속"}"을 삭제할까요?`)) return;
    auth
      .deletePoll(id)
      .then(() => {
        deletedPollIds.add(id);
        remotePolls = remotePolls.filter((item) => item.id !== id);
        if (ui.pollEditId === id) {
          ui.pollEditId = null;
          ui.modal = null;
        }
        render();
      })
      .catch(() => {
        alert("약속을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
      });
    return;
  } else if (act === "meet-ai") {
    runMeetingAi(id);
    return;
  } else if (act === "del-cat") store.deleteCategory(id);
  else if (act === "open-search") {
    ui.panel = false;
    ui.modal = "search";
    ui.searchQuery = "";
    ui.searchHits = [];
  } else if (act === "go-search-hit") {
    const route = actEl.dataset.route || "/today";
    if (actEl.dataset.type === "course" && actEl.dataset.tt) ui.timetableId = actEl.dataset.tt;
    ui.modal = null;
    ui.searchQuery = "";
    ui.searchHits = [];
    go(route);
    return;
  } else if (act === "bell") ui.panel = !ui.panel;
  else if (act === "open-note" || act === "go-notification") {
    store.markNotificationsRead();
    ui.panel = false;
    const groupId = actEl.dataset.group;
    const pollId = actEl.dataset.poll;
    if (act === "go-notification" && groupId && pollId) {
      go(groupPath(groupId, "schedule"));
      return;
    }
    if (act === "go-notification" && groupId) {
      go(groupPath(groupId, "tasks"));
      return;
    }
    if (act === "go-notification") go("/today");
  }
  else if (act === "dismiss-toast") {
    ui.toast = null;
    document.querySelector(".toast-stack")?.remove();
    return;
  }
  else if (act === "export-data") {
    exportBackupJson();
    return;
  } else if (act === "export-gpa-csv") {
    exportGpaCsvFile();
    return;
  } else if (act === "open-delete-account") {
    if (!auth.user()) return;
    ui.modal = "delete-account";
    ui.deletingAccount = false;
  } else if (act === "auth") {
    if (auth.user()) {
      ui.onboarding = false;
      ui.authNotice = "";
      ui.authMode = "login";
      ui.modal = null;
      ui.accountReady = false;
      store.flushPersist();
      auth.logout();
    }
  } else if (act === "auth-mode") {
    ui.authMode = actEl.dataset.mode === "signup" ? "signup" : "login";
  } else if (act === "leave-desk") {
    store.autoFinishActiveTimer();
    go("/today");
  } else if (act === "edit-cat") ui.editCategoryId = id;
  else if (act === "cancel-edit-cat") ui.editCategoryId = null;
  else if (act === "toggle-tools") ui.toolsOpen = !ui.toolsOpen;
  else if (act === "open-tool") {
    ui.tool = actEl.dataset.tool;
    ui.toolsOpen = false;
  } else if (act === "close-tool") ui.tool = null;
  else if (act === "sw-start") {
    ui.stopwatch.running = true;
    ui.stopwatch.startedAt = Date.now();
  } else if (act === "sw-pause") {
    ui.stopwatch.accumulated = stopwatchNow();
    ui.stopwatch.running = false;
    ui.stopwatch.startedAt = null;
  } else if (act === "sw-reset") {
    ui.stopwatch = { running: false, accumulated: 0, startedAt: null };
  } else if (act === "calc") {
    applyCalc(actEl.dataset.key);
  } else if (act === "open-event") {
    ui.eventId = null;
    ui.modal = "event";
  } else if (act === "edit-event") {
    ui.eventId = id || ui.eventId;
    ui.modal = "event-edit";
  }
  else if (act === "close-modal") {
    if (!auth.user() || ui.deletingAccount) return;
    ui.modal = null;
    resetCourseDrafts();
    ui.editingTaskId = null;
    ui.eventId = null;
    ui.pollGroupId = null;
    ui.pollEditId = null;
    ui.pollMenu = null;
    ui.newPageParent = "";
    ui.newPageGroupId = "";
    ui.searchQuery = "";
    ui.searchHits = [];
  } else if (act === "start-add") ui.addingCategory = actEl.dataset.cat;
  else if (act === "cancel-add") ui.addingCategory = null;
  else if (act === "toggle-more") ui.navMore = !ui.navMore;
  else if (act === "close-more") {
    if (event.target.closest(".more-sheet")) return;
    ui.navMore = false;
  }
  else if (act === "note-more-toggle") {
    ui.noteMoreOpen = !ui.noteMoreOpen;
    if (!ui.noteMoreOpen) {
      ui.colorOpen = false;
      ui.highlightOpen = false;
      ui.emojiOpen = false;
    }
  }
  else return;
  render();
  if (act === "start-add") {
    requestAnimationFrame(() => document.querySelector("[data-add-title]")?.focus());
  }
  if (act === "open-search") {
    requestAnimationFrame(() => document.querySelector("[data-act='global-query']")?.focus());
  }
  if (act === "add-subtask" || act === "toggle-subtask" || act === "del-subtask") {
    requestAnimationFrame(() => document.querySelector("[data-act='subtask-title']")?.focus());
  }
  if (act === "open-course" || act === "edit-course") {
    requestAnimationFrame(() => document.querySelector("form[data-act='add-course'] [name='title']")?.focus());
  }
  if (act === "open-event" || act === "edit-event") {
    requestAnimationFrame(() => document.querySelector("form[data-act='add-event'] [name='title'], form[data-act='save-event'] [name='title']")?.focus());
  }
  if (act === "rename-poll") {
    requestAnimationFrame(() => document.querySelector("form[data-act='save-poll-title'] [name='title']")?.focus());
  }
  if (act === "open-delete-account") {
    requestAnimationFrame(() => document.querySelector("form[data-act='confirm-delete-account'] [name='email']")?.focus());
  }
}

function onSubmit(event) {
  const form = event.target.closest("form[data-act]");
  if (!form) return;
  event.preventDefault();
  const act = form.dataset.act;
  const data = new FormData(form);
  if (act === "add-task") {
    store.addTask({
      title: data.get("title"),
      scheduledDate: data.get("date"),
      categoryId: data.get("categoryId") || "school",
      note: data.get("note") || "",
    });
    ui.addingCategory = null;
  } else if (act === "save-task") {
    const typing = document.activeElement;
    if (typing?.dataset?.act === "subtask-title") {
      store.addSubtask(ui.editingTaskId, typing.value);
      render();
      requestAnimationFrame(() => document.querySelector("[data-act='subtask-title']")?.focus());
      return;
    }
    const task = store.getState().tasks.find((item) => item.id === ui.editingTaskId);
    if (task) {
      const changes = {
        title: String(data.get("title") || "").trim(),
        note: String(data.get("note") || "").trim(),
      };
      if (task.groupId) {
        changes.assigneeName = String(data.get("assigneeName") || "").trim();
        changes.dueDate = data.get("dueDate") || task.dueDate;
      } else {
        changes.categoryId = data.get("categoryId") || task.categoryId;
        changes.scheduledDate = data.get("scheduledDate") || task.scheduledDate;
        changes.dueDate = data.get("dueDate") || "";
      }
      changes.priority = String(data.get("priority") || "normal");
      const freq = String(data.get("repeatFreq") || "");
      changes.repeat =
        freq === "daily" || freq === "weekly"
          ? { freq, until: String(data.get("repeatUntil") || "").trim() || null, seriesId: task.repeat?.seriesId }
          : null;
      store.updateTask(task.id, changes);
      if (task.groupId) {
        auth.updateGroupTask(task.id, changes).catch(() => {
          alert("할 일 저장에 실패했어요. 다시 시도해 주세요.");
        });
      }
    }
    ui.modal = null;
    ui.editingTaskId = null;
  } else if (act === "add-group-task") {
    const groupId = data.get("groupId");
    const title = data.get("title");
    const dueDate = data.get("dueDate") || todayKey();
    const picked = String(data.get("assigneeName") || "");
    const group = (store.getState().groups || []).find((item) => item.id === groupId);
    const assignees =
      picked === "전체"
        ? (group?.memberIds || []).map((id) => memberLabel(id))
        : [picked];
    for (const assigneeName of assignees) {
      store.addTask({
        title,
        assigneeName,
        scheduledDate: todayKey(),
        dueDate,
        categoryId: "work",
        groupId,
      });
    }
    if (picked === "전체") {
      ui.toast = { title: "할 일", body: `${assignees.length}명 모두에게 할 일을 추가했어요` };
    }
    Promise.all(
      assignees.map((assigneeName) =>
        auth.addGroupTask({
          groupId,
          title,
          assigneeName,
          dueDate,
        }),
      ),
    )
      .then(() => refreshGroupBundle())
      .catch(() => {
        alert("할 일 저장에 실패했어요. 다시 시도해 주세요.");
      });
  } else if (act === "change-password") {
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirm") || "");
    if (password !== confirm) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    auth
      .changePassword(password)
      .then(() => {
        ui.toast = { title: "비밀번호", body: "비밀번호를 변경했습니다." };
        render();
      })
      .catch((err) => alert(err.message));
    return;
  } else if (act === "change-email") {
    auth
      .changeEmail(String(data.get("email") || "").trim())
      .then(() => {
        ui.toast = { title: "이메일", body: "확인 메일을 보냈습니다. 링크를 누르면 이메일이 바뀝니다." };
        render();
      })
      .catch((err) => alert(err.message));
    return;
  } else if (act === "confirm-delete-account") {
    const email = String(data.get("email") || "").trim();
    const expected = String(auth.user()?.email || "").trim();
    if (!expected || email.toLowerCase() !== expected.toLowerCase()) {
      alert("이메일이 계정과 일치하지 않습니다.");
      return;
    }
    if (ui.deletingAccount) return;
    ui.deletingAccount = true;
    render();
    auth
      .deleteAccount(email)
      .then(() => leaveDeletedAccount())
      .catch((err) => {
        ui.deletingAccount = false;
        alert(err.message || "계정을 삭제하지 못했습니다.");
        render();
      });
    return;
  } else if (act === "save-profile") {
    const nickname = String(data.get("nickname") || "").trim();
    const bio = String(data.get("bio") || "").trim();
    const photoUrl = store.getState().profile?.photoUrl || "";
    store.updateProfile({ nickname, bio, photoUrl });
    if (auth.user()) {
      auth.saveProfile(nickname).catch(() => {});
      profilesReady = false;
      ensureRemoteProfiles();
    }
    if (ui.onboarding) {
      ui.onboarding = false;
      go("/today");
      render();
      return;
    }
  } else if (act === "signup") {
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "").trim();
    if (!email || !password) {
      alert("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    ui.onboarding = true;
    auth
      .signup(email, password, name)
      .then((result) => {
        if (result?.needsConfirmation) {
          ui.onboarding = false;
          ui.authMode = "login";
          ui.authNotice = "확인 메일의 링크를 누르면 가입이 완료됩니다. 확인 전에는 앱을 사용할 수 없어요.";
          render();
          return;
        }
        ui.authNotice = "";
        ui.onboarding = true;
        if (name) store.updateProfile({ nickname: name });
        go("/profile");
        render();
      })
      .catch((err) => {
        ui.onboarding = false;
        ui.authMode = "signup";
        alert(auth.authErrorMessage(err));
        render();
      });
    return;
  } else if (act === "add-comment") {
    const page = store.projectById(currentPageId());
    const text = String(data.get("text") || "").trim();
    const blockId = form.dataset.id;
    if (!page || !text || !blockId) return;
    commitBlocks(
      page.id,
      page.blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              comments: [...(block.comments || []), { id: uid("cmt"), text, createdAt: Date.now() }],
            }
          : block,
      ),
    );
    ui.commentDraft = "";
    ui.commentBlockId = blockId;
    render();
    return;
  } else if (act === "add-event" || act === "save-event") {
    const startTime = data.get("startTime") || "09:00";
    const endTime = data.get("endTime") || "10:00";
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      alert("종료 시간이 시작 시간보다 늦어야 합니다.");
      return;
    }
    const payload = {
      title: data.get("title"),
      date: data.get("date"),
      startTime,
      endTime,
      color: eventColorValue(data.get("color")),
    };
    if (act === "save-event") {
      store.updateEvent(data.get("id") || ui.eventId, payload);
    } else {
      store.addEvent(payload);
    }
    ui.modal = null;
    ui.eventId = null;
  } else if (act === "add-course") {
    const id = String(data.get("id") || "");
    const slots = store.normalizeSlots(ui.courseSlotsDraft);
    const payload = {
      title: data.get("title"),
      room: data.get("room") || "",
      professor: data.get("professor") || "",
      color: ui.courseColorDraft || data.get("color") || "#0EA5E9",
      memo: data.get("memo") || "",
      slots,
    };
    if (slots.some((slot) => timeToMinutes(slot.endTime) <= timeToMinutes(slot.startTime))) {
      alert("종료 시간이 시작 시간보다 늦어야 합니다.");
      return;
    }
    if (draftSlotsOverlap(slots)) {
      alert("같은 요일에 시간이 겹치는 슬롯이 있습니다.");
      return;
    }
    const timetableId = id ? store.timetableIdForCourse(id) || activeTimetableId() : activeTimetableId();
    const clash = store.coursesIn(timetableId).some(
      (course) => course.id !== id && coursesOverlap(course, payload),
    );
    if (clash) {
      alert("같은 요일에 시간이 겹치는 수업이 있습니다.");
      return;
    }
    if (id) store.updateCourse(id, payload);
    else store.addCourse(payload, timetableId);
    ui.modal = null;
    resetCourseDrafts();
    maybeSyncTimetable();
  } else if (act === "create-poll") {
    if (!requireLoginForGroups()) {
      render();
      return;
    }
    const dates = datesBetween(data.get("fromDate"), data.get("toDate"));
    if (!dates.length) {
      alert("날짜 범위를 확인해주세요. 최대 14일까지 선택할 수 있어요.");
      return;
    }
    if (timeToMinutes(data.get("endTime") || "22:00") <= timeToMinutes(data.get("startTime") || "09:00")) {
      alert("종료 시간이 시작 시간보다 늦어야 합니다.");
      return;
    }
    const groupId = String(data.get("groupId") || ui.pollGroupId || groupRoute()?.groupId || "");
    if (!groupId) {
      alert("그룹을 찾을 수 없어요. 그룹 일정 탭에서 다시 시도해주세요.");
      return;
    }
    auth
      .createPoll({
        groupId,
        groupName: store.getState().groups.find((item) => item.id === groupId)?.name,
        inviteCode: store.getState().groups.find((item) => item.id === groupId)?.inviteCode,
        title: data.get("title"),
        dates,
        startTime: data.get("startTime") || "09:00",
        endTime: data.get("endTime") || "22:00",
      })
      .then((result) => {
        if (!result?.poll) throw new Error("empty-poll");
        upsertRemotePoll({
          ...result.poll,
          pendingCreate: true,
          groupId: result.poll.groupId || groupId,
          responses: Array.isArray(result.poll.responses) ? result.poll.responses : [],
        });
        ui.modal = null;
        ui.pollGroupId = null;
        ui.pollEditId = null;
        ui.pollMenu = null;
        ui.groupTab = "schedule";
        const dest = `#${groupPath(groupId, "schedule")}`;
        if (location.hash !== dest) go(groupPath(groupId, "schedule"));
        render();
        requestAnimationFrame(() => {
          document.querySelector(`[data-poll-card="${result.poll.id}"]`)?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
        });
        refreshGroupBundle();
      })
      .catch(() => {
        alert("약속 잡기를 만들지 못했어요. 로그인 상태와 그룹 멤버 여부를 확인해주세요.");
      });
    return;
  } else if (act === "save-poll-title") {
    const pollId = String(data.get("id") || ui.pollEditId || "");
    const title = String(data.get("title") || "").trim();
    if (!pollId || !title) {
      alert("제목을 입력해주세요.");
      return;
    }
    auth
      .updatePoll(pollId, title)
      .then((result) => {
        upsertRemotePoll(result?.poll || { id: pollId, title });
        ui.modal = null;
        ui.pollEditId = null;
        ui.pollMenu = null;
        render();
      })
      .catch(() => {
        alert("약속 이름을 바꾸지 못했어요. 잠시 후 다시 시도해주세요.");
      });
    return;
  } else if (act === "find-availability") {
    runFindAvailability(form);
    return;
  } else if (act === "gpa-sim") {
    ui.gpaTarget = String(data.get("target") || ui.gpaTarget);
    ui.gpaRemain = String(data.get("remain") || ui.gpaRemain);
  } else if (act === "add-grade") {
    store.addGradeRecord({
      semester: data.get("semester"),
      title: data.get("title"),
      credit: data.get("credit"),
      grade: data.get("grade"),
      isMajor: data.get("isMajor") === "on",
    });
  } else if (act === "save-cat") {
    const id = String(data.get("id") || "");
    const name = String(data.get("name") || "").trim();
    const color = String(data.get("color") || "").trim();
    if (id && name) store.updateCategory(id, { name, color: color || "#2563eb" });
    ui.editCategoryId = null;
  } else if (act === "add-cat") {
    store.addCategory(data.get("name"), "#2563eb");
  } else if (act === "login") {
    auth
      .login(data.get("email"), data.get("password"))
      .then(() => {
        ui.authNotice = "";
        ui.onboarding = false;
        ui.modal = null;
        go("/today");
        render();
      })
      .catch((err) => {
        ui.authMode = "login";
        alert(auth.authErrorMessage(err));
        render();
      });
    return;
  }
  render();
}

function onInput(event) {
  const el = event.target;
  if (el.dataset.act === "time-hour" || el.dataset.act === "time-minute") {
    syncTimeField(el.closest("[data-time-field]"));
    return;
  }
  if (el.dataset.act === "course-color-pick") {
    applyCourseColorDraft(el.value);
    return;
  }
  if (el.dataset.act === "theme-color-pick") {
    applyPlainTheme(el.value);
    return;
  }
  if (el.dataset.act === "course-slot-field") {
    syncCourseSlotDraft(el);
    return;
  }
  if (el.dataset.act === "global-query") {
    queueGlobalSearch(el.value);
    return;
  }
  if (el.dataset.act === "gpa-target") {
    ui.gpaTarget = el.value;
    const box = document.querySelector("[data-gpa-sim-out]");
    if (box) box.innerHTML = gpaSimResultHtml(store.calcGpa(store.getState().gradeRecords || []));
    return;
  }
  if (el.dataset.act === "gpa-remain") {
    ui.gpaRemain = el.value;
    const box = document.querySelector("[data-gpa-sim-out]");
    if (box) box.innerHTML = gpaSimResultHtml(store.calcGpa(store.getState().gradeRecords || []));
    return;
  }
  if (el.dataset.act === "set-grad-credits") {
    store.updateSettings({ graduationCredits: el.value });
    return;
  }
  if (el.dataset.act === "aux-custom") {
    ui.auxMinutes = el.value;
    return;
  }
  if (el.dataset.act === "note-query") {
    ui.noteQuery = el.value;
    const body = document.querySelector("[data-folder-body]");
    if (!body) return;
    const current = store.projectById(ui.notePageId);
    const folder = current && !isFolderItem(current) ? store.projectById(current.parentId) : current;
    const scope = current?.groupId || folder?.groupId || groupRoute()?.groupId || null;
    body.innerHTML = folderBodyHtml(isFolderItem(folder) ? folder : null, scope);
    return;
  }
  if (el.dataset.act === "pdf-page-input") return;
  if (el.dataset.act === "pdf-notes") {
    store.updatePage(el.dataset.id, { pdfNotes: el.value });
    return;
  }
  if (el.dataset.act === "pdf-text") {
    commitPdfText(el, { persist: false });
    return;
  }
  if (el.dataset.act === "find-q") {
    ui.findQ = el.value;
    ui.findIndex = 0;
    return;
  }
  if (el.dataset.act === "replace-q") {
    ui.replaceQ = el.value;
    return;
  }
  if (el.dataset.act === "rename-page") {
    store.updatePage(el.dataset.id, { name: el.value });
    const label = el.value || "제목 없음";
    const row = document.querySelector(`[data-act="open-page"][data-id="${el.dataset.id}"] .note-row-title`);
    if (row) row.textContent = label;
    const card = document.querySelector(`.folder-card[data-id="${el.dataset.id}"] .folder-card-name`);
    if (card) card.textContent = label;
    return;
  }
  if (el.dataset.act === "rename-doc-tab") {
    store.renamePageTab(el.dataset.id, el.dataset.tab, el.value);
    return;
  }
  if (el.dataset.act === "note-size-input") {
    const n = Number(el.value);
    if (!Number.isFinite(n) || el.value === "") return;
    if (n < 12 || n > 42) return;
    applyFontSize(n);
    return;
  }
  if (el.dataset.act === "block") {
    ui.selectedBlockId = el.dataset.id;
    saveBlockFromEl(el);
    return;
  }
  if (el.dataset.act === "table") {
    const page = store.projectById(currentPageId());
    const blockEl = el.closest("[data-block]");
    const block = page?.blocks.find((item) => item.id === blockEl?.dataset.block);
    if (!block) return;
    ui.selectedBlockId = block.id;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (r < 0) {
      const headers = [...(block.headers || [])];
      headers[c] = el.innerText;
      commitBlocks(
        page.id,
        page.blocks.map((item) => (item.id === block.id ? { ...item, headers } : item)),
        { debounce: true },
      );
    } else {
      const rows = block.rows.map((row) => [...row]);
      rows[r][c] = el.innerText;
      commitBlocks(
        page.id,
        page.blocks.map((item) => (item.id === block.id ? { ...item, rows } : item)),
        { debounce: true },
      );
    }
  }
}

function onKey(event) {
  const mod = event.metaKey || event.ctrlKey;
  const inField = event.target.closest("input, textarea, select, [data-act='find-q'], [data-act='replace-q'], [data-act='note-query'], [data-act='rename-page'], [data-act='rename-doc-tab'], [data-act='pdf-page-input'], [data-act='pdf-text']");
  if (event.key === "Escape") {
    if (ui.deletingAccount) return;
    ui.formatOpen = false;
    ui.listOpen = false;
    ui.colorOpen = false;
    ui.highlightOpen = false;
    ui.emojiOpen = false;
    const findWas = ui.findOpen;
    const commentWas = ui.commentBlockId;
    const renameWas = ui.renamingTabId;
    const menuWas = ui.docTabMenu;
    const ttMenuWas = ui.timetableMenu;
    const pollMenuWas = ui.pollMenu;
    ui.findOpen = false;
    ui.commentBlockId = null;
    ui.renamingTabId = null;
    ui.docTabMenu = null;
    ui.timetableMenu = false;
    ui.pollMenu = null;
    document.querySelectorAll(".note-color-pop").forEach((el) => el.classList.remove("open"));
    document.querySelector(".note-emoji-pop")?.classList.remove("open");
    if (findWas || commentWas || renameWas || menuWas || ttMenuWas || pollMenuWas) render();
  }
  if (mod && event.key.toLowerCase() === "z" && !inField && document.querySelector(".note-doc")) {
    event.preventDefault();
    if (event.shiftKey) redoNote();
    else undoNote();
    return;
  }
  if (mod && event.key.toLowerCase() === "y" && !inField && document.querySelector(".note-doc")) {
    event.preventDefault();
    redoNote();
    return;
  }
  if (mod && event.key.toLowerCase() === "f" && document.querySelector(".note-doc")) {
    event.preventDefault();
    ui.findOpen = true;
    render();
    requestAnimationFrame(() => document.querySelector("[data-act='find-q']")?.focus());
    return;
  }
  if (mod && event.key === "Enter" && ui.findOpen) {
    event.preventDefault();
    findNextMatch();
    return;
  }
  if (event.key === "Enter" && event.target.closest("[data-act='find-q'], [data-act='replace-q']")) {
    event.preventDefault();
    findNextMatch();
    return;
  }
  if (event.key === "Enter" && event.target.closest("[data-act='rename-doc-tab']")) {
    event.preventDefault();
    ui.renamingTabId = null;
    render();
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.closest(".page-title-act")) {
    event.preventDefault();
    event.target.closest(".page-title-act").click();
    return;
  }
  const el = event.target.closest("[data-act='block']");
  if (!el) return;
  ui.selectedBlockId = el.dataset.id;
  const page = store.projectById(currentPageId());
  if (!page) return;
  const index = page.blocks.findIndex((block) => block.id === el.dataset.id);
  if (index < 0) return;
  const current = page.blocks[index];
  const listType = ["checklist", "bullet", "numbered"].includes(current.type);

  if (event.key === "Tab") {
    event.preventDefault();
    bumpIndent(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveBlockFromEl(el);
    const text = htmlToText(el.innerHTML).trim();
    if (listType && text === "") {
      applyNoteStyle("paragraph");
      const keep = current.id;
      commitBlocks(
        page.id,
        store.projectById(page.id).blocks.map((block) =>
          block.id === keep ? { ...block, indent: 0 } : block,
        ),
      );
      render();
      refocusBlock(keep);
      return;
    }
    const nextType = listType ? current.type : "paragraph";
    const next = store.newBlock(nextType);
    next.indent = current.indent || 0;
    const blocks = [...store.projectById(page.id).blocks];
    const at = blocks.findIndex((block) => block.id === current.id);
    blocks.splice(at + 1, 0, next);
    commitBlocks(page.id, blocks);
    ui.selectedBlockId = next.id;
    render();
    refocusBlock(next.id);
    return;
  }

  if (event.key === "Backspace" && caretAtStart(el)) {
    if ((current.indent || 0) > 0) {
      event.preventDefault();
      bumpIndent(-1);
      return;
    }
    if (listType && htmlToText(el.innerHTML).trim() === "") {
      event.preventDefault();
      applyNoteStyle("paragraph");
      render();
      refocusBlock(current.id);
      return;
    }
    if (page.blocks.length > 1 && htmlToText(el.innerHTML).trim() === "") {
      event.preventDefault();
      const prev = page.blocks[index - 1];
      commitBlocks(
        page.id,
        page.blocks.filter((block) => block.id !== current.id),
      );
      ui.selectedBlockId = prev?.id || store.projectById(page.id)?.blocks[0]?.id;
      render();
      refocusBlock(ui.selectedBlockId);
    }
  }
}

function onFocusIn(event) {
  const block = event.target.closest("[data-act='block'], [data-act='table'], [data-act='rename-page']");
  if (!block) return;
  if (block.dataset.act === "rename-page") return;
  ui.selectedBlockId = block.dataset.id || block.closest("[data-block]")?.dataset.block || ui.selectedBlockId;
  const current = selectedBlock();
  const type = current?.type || "paragraph";
  document.querySelectorAll("[data-act='note-style']").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.type === type);
  });
  document.querySelector("[data-act='note-check']")?.classList.toggle("on", type === "checklist");
  document.querySelector("[data-act='note-table']")?.classList.toggle("on", type === "table");
  const styleSel = document.querySelector("[data-act='note-style-select']");
  if (styleSel) styleSel.value = NOTE_PARA_STYLES.some((item) => item.type === type) ? type : "paragraph";
  const fontSel = document.querySelector("[data-act='note-font-select']");
  if (fontSel) {
    const fonts = noteFontOptions();
    fontSel.value = fonts.some((item) => item.id === current?.fontFamily) ? current.fontFamily : "Pretendard";
  }
  const size = blockFontSize(current);
  const sizeInput = document.querySelector("[data-act='note-size-input']");
  if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = String(size);
  const lineSel = document.querySelector("[data-act='note-line-height']");
  if (lineSel) lineSel.value = NOTE_LINE_HEIGHTS.includes(Number(current?.lineHeight)) ? String(current.lineHeight) : "";
}

function onNoteChromeDown(event) {
  if (event.target.closest("[data-note-chrome]") && !event.target.closest("select, input, textarea")) {
    event.preventDefault();
  }
}

function onNotePaste(event) {
  const el = event.target.closest("[data-act='block']");
  if (!el) return;
  event.preventDefault();
  const plain = ui.pastePlain || event.shiftKey;
  if (plain) {
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  } else {
    const html = event.clipboardData.getData("text/html");
    const snippet = html ? sanitizeNoteHtml(html) : escapeHtml(event.clipboardData.getData("text/plain")).replace(/\n/g, "<br>");
    document.execCommand("insertHTML", false, snippet);
  }
  ui.selectedBlockId = el.dataset.id;
  saveBlockFromEl(el);
}

function syncKeyboard() {
  const vv = window.visualViewport;
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const inDesk = Boolean(document.querySelector(".desk"));
  const nav = mobile && !inDesk && kb < 48 ? 64 : 0;
  document.documentElement.style.setProperty("--kb", `${kb + nav}px`);
}

async function boot() {
  applyAppearance();
  bindSystemTheme();
  render();
  await auth.initAuth();
  ui.authReady = true;
  store.setRemoteSaver((payload) => auth.pushRemote(payload).catch(() => {}));
  if (auth.user()) {
    await hydrateAccount();
    if (!location.hash || location.hash === "#") location.hash = "#/today";
  } else {
    store.bindAccount(null);
  }
  try {
    const response = await fetch("/changelog.json");
    const entries = response.ok ? await response.json() : [];
    const latest = Array.isArray(entries) ? entries[0] : null;
    if (latest?.version) store.checkChangelog(latest.version, latest.notes);
  } catch {
    /* changelog is optional */
  }
  await registerCustomFont(store.getState().settings?.customFont);
  store.materializeRecurringTasks(todayKey());
  applyAppearance();
  lastRouteName = parseHash().name;
  render();
  maybeSyncTimetable();
  auth.onAuth(() => {
    remoteProfiles = [];
    remotePolls = [];
    deletedPollIds.clear();
    bundleGen += 1;
    profilesReady = false;
    profilesRequest = null;
    if (!auth.user()) {
      ui.onboarding = false;
      ui.modal = null;
      ui.accountReady = false;
      groupMemberSnapshot.clear();
      store.bindAccount(null);
      applyAppearance();
      render();
      return;
    }
    hydrateAccount().then(() => {
      applyAppearance();
      maybeSyncTimetable();
      render();
    });
  });
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("focusout", (event) => {
    const act = event.target?.dataset?.act;
    if (act === "time-hour" || act === "time-minute") polishTimeField(event.target);
    if (act === "pdf-text") {
      commitPdfText(event.target, { persist: true, removeEmpty: true });
    }
  });
  document.addEventListener("pointerover", (event) => {
    const cell = event.target.closest("[data-act='toggle-poll-slot']");
    if (!cell) return;
    const pollId = cell.dataset.poll;
    const slot = cell.dataset.slot;
    if (ui.pollHover?.pollId === pollId && ui.pollHover?.slot === slot) return;
    ui.pollHover = { pollId, slot };
    document.querySelectorAll(".poll-cell.tip").forEach((el) => el.classList.remove("tip"));
    cell.classList.add("tip");
    const poll = remotePolls.find((item) => item.id === pollId);
    const names = poll
      ? pollResponsesFor(poll)
          .filter((row) => (row.slots || []).includes(slot))
          .map((row) => memberLabel(row.userId))
      : [];
    const hint = cell.closest(".poll-card")?.querySelector(".poll-hint");
    if (hint) hint.textContent = names.length ? `${slot} · ${names.join(", ")}` : `${slot} · 아직 표시한 멤버가 없어요`;
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el?.dataset?.act === "pdf-page-input") {
      setPdfViewPage(el.value);
      return;
    }
    if (el?.dataset?.act === "note-style-select") {
      applyNoteStyle(el.value);
      const keep = ui.selectedBlockId;
      render();
      refocusBlock(keep);
      return;
    }
    if (el?.dataset?.act === "note-font-select") {
      applyFontFamily(el.value);
      return;
    }
    if (el?.dataset?.act === "note-line-height") {
      applyLineHeight(el.value);
      return;
    }
    if (el?.dataset?.act === "note-size-input") {
      applyFontSize(el.value);
      el.value = String(blockFontSize(selectedBlock()));
      return;
    }
    if (el?.dataset?.act === "rename-doc-tab") {
      store.renamePageTab(el.dataset.id, el.dataset.tab, el.value);
      ui.renamingTabId = null;
      render();
      return;
    }
    if (el?.dataset?.act === "course-color-pick") {
      applyCourseColorDraft(el.value);
      return;
    }
    if (el?.dataset?.act === "theme-color-pick") {
      applyPlainTheme(el.value);
      return;
    }
    if (el?.dataset?.act === "course-slot-field") {
      syncCourseSlotDraft(el);
      return;
    }
    if (el?.dataset?.act === "profile-photo") {
      const file = el.files?.[0];
      if (file) applyProfilePhoto(file);
      el.value = "";
      return;
    }
    if (el?.dataset?.act === "set-reject") {
      store.updateSettings({ rejectGroupInvites: el.checked });
      return;
    }
    if (el?.dataset?.act === "set-share-timetable") {
      store.updateSettings({ shareTimetableWithGroups: el.checked });
      maybeSyncTimetable({ empty: !el.checked, refresh: true });
      return;
    }
    if (el?.dataset?.act === "set-notify") {
      store.updateSettings({ notifications: { [el.dataset.key]: el.checked } });
      return;
    }
    if (el?.dataset?.act === "upload-font") {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      if (file.size > CUSTOM_FONT_MAX) {
        alert("폰트 파일이 너무 큽니다");
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const ok = await registerCustomFont({ dataUrl });
        if (!ok) {
          alert("폰트를 불러오지 못했습니다.");
          return;
        }
        store.updateSettings({ customFont: { name: file.name, dataUrl }, fontFamily: "custom" });
        applyAppearance();
        render();
      };
      reader.readAsDataURL(file);
    }
  });
  document.addEventListener("keydown", onKey);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("mousedown", onNoteChromeDown);
  document.addEventListener("paste", onNotePaste);
  lastRouteName = parseHash().name;
  const onLeaveFocus = () => store.autoFinishActiveTimer();
  window.addEventListener("beforeunload", onLeaveFocus);
  window.addEventListener("pagehide", onLeaveFocus);
  window.addEventListener("hashchange", () => {
    const next = parseHash().name;
    if (lastRouteName === "focus" && next !== "focus") store.autoFinishActiveTimer();
    lastRouteName = next;
    ui.navMore = false;
    if (next === "groups") maybeRefreshGroupBundle();
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeRefreshGroupBundle();
  });
  setInterval(maybeRefreshGroupBundle, 45000);
  window.visualViewport?.addEventListener("resize", syncKeyboard);
  window.visualViewport?.addEventListener("scroll", syncKeyboard);
  syncKeyboard();
  setInterval(patchClocks, 250);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

boot();
