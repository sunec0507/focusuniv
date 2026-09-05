import {
  addDays,
  auxiliaryRemaining,
  dayProgress,
  focusElapsed,
  formatDateKey,
  parseDateKey,
  uid,
} from "./util.js";

const KEY = "focus-web-v1";
const MAX_GROUP_MEMBERS = 8;
const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CATEGORY_COLORS = {
  school: "#0EA5E9",
  work: "#6366F1",
  personal: "#2563EB",
  exercise: "#16A34A",
};

export const GRADE_POINTS_45 = { "A+": 4.5, A0: 4.0, "B+": 3.5, B0: 3.0, "C+": 2.5, C0: 2.0, "D+": 1.5, D0: 1.0, F: 0 };
export const GRADE_POINTS_43 = { "A+": 4.3, A0: 4.0, "B+": 3.3, B0: 3.0, "C+": 2.3, C0: 2.0, "D+": 1.3, D0: 1.0, F: 0 };

export function defaultSettings() {
  return {
    rejectGroupInvites: false,
    shareTimetableWithGroups: false,
    notifications: { groupUpdates: true },
    fontSize: "md",
    fontFamily: "pretendard",
    themeMode: "system",
    themeColor: "#2563eb",
    themeSchool: null,
    themeBgTint: false,
    customFont: null,
    graduationCredits: 130,
  };
}

function defaultCoursePresetColors() {
  return Object.values(CATEGORY_COLORS);
}

function emptyParagraph() {
  return { id: uid("block"), type: "paragraph", text: "", indent: 0 };
}

function ensurePageTabs(page) {
  if (!page || page.type === "folder" || page.type === "pdf") return page;
  if (Array.isArray(page.tabs) && page.tabs.length) {
    const tabs = page.tabs.map((tab, index) => ({
      id: tab?.id || uid("tab"),
      name: String(tab?.name || `탭 ${index + 1}`).trim() || `탭 ${index + 1}`,
      blocks: Array.isArray(tab?.blocks) && tab.blocks.length ? tab.blocks : [emptyParagraph()],
    }));
    const active = tabs.find((tab) => tab.id === page.activeTabId) || tabs[0];
    return { ...page, type: "page", tabs, activeTabId: active.id, blocks: active.blocks };
  }
  const tabId = uid("tab");
  const blocks = Array.isArray(page.blocks) && page.blocks.length ? page.blocks : [emptyParagraph()];
  return {
    ...page,
    type: "page",
    tabs: [{ id: tabId, name: "탭 1", blocks }],
    activeTabId: tabId,
    blocks,
  };
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function annotationCount(map) {
  return Object.values(map || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

function normalizePdfText(item) {
  return {
    id: item.id || uid("ann"),
    type: "text",
    x: clampUnit(item.x),
    y: clampUnit(item.y),
    text: String(item.text ?? ""),
    color: String(item.color || "#111827"),
    fontSize: Math.min(0.12, Math.max(0.01, Number(item.fontSize) || 0.022)),
  };
}

function normalizePdfStroke(item) {
  const points = (Array.isArray(item.points) ? item.points : [])
    .map((pt) => ({
      x: clampUnit(pt?.x),
      y: clampUnit(pt?.y),
    }))
    .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));
  if (!points.length) return null;
  return {
    id: item.id || uid("ann"),
    type: "stroke",
    points,
    color: String(item.color || "#111827"),
    width: normalizeInkWidth(item.width),
  };
}

function normalizePdfAnnotations(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, list] of Object.entries(raw)) {
    const n = Math.max(1, Number(key) || 0);
    if (!n || !Array.isArray(list)) continue;
    const items = list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        if (item.type === "text" || (item.text != null && !Array.isArray(item.points))) return normalizePdfText(item);
        return normalizePdfStroke(item);
      })
      .filter(Boolean);
    if (items.length) out[n] = items;
  }
  return out;
}

function mergePdfAnnotationMaps(preferred, other) {
  const a = normalizePdfAnnotations(preferred);
  const b = normalizePdfAnnotations(other);
  const out = { ...b };
  for (const [key, list] of Object.entries(a)) {
    const n = Number(key);
    const alt = out[n] || [];
    out[n] = list.length >= alt.length ? list : alt;
  }
  return out;
}

function mergePdfProjectFields(incoming, local) {
  const localById = new Map((Array.isArray(local) ? local : []).map((page) => [page?.id, page]));
  return (Array.isArray(incoming) ? incoming : []).map((page) => {
    if (!page || page.type !== "pdf") return page;
    const prev = localById.get(page.id);
    if (!prev) return { ...page, pdfAnnotations: normalizePdfAnnotations(page.pdfAnnotations) };
    const preferLocal = (prev.updatedAt || 0) >= (page.updatedAt || 0);
    return {
      ...page,
      pdfAnnotations: mergePdfAnnotationMaps(
        preferLocal ? prev.pdfAnnotations : page.pdfAnnotations,
        preferLocal ? page.pdfAnnotations : prev.pdfAnnotations,
      ),
      pdfNotes: preferLocal ? String(prev.pdfNotes || page.pdfNotes || "") : String(page.pdfNotes || prev.pdfNotes || ""),
    };
  });
}

const ANN_KEY = "focus-web-v1-pdf-ann";

let activeUserId = null;
let persistEnabled = true;

function storageKey(userId = activeUserId) {
  return userId ? `${KEY}:${userId}` : "";
}

function annotationKey(userId = activeUserId) {
  return userId ? `${ANN_KEY}:${userId}` : "";
}

function annotationSidecar(projects) {
  const out = {};
  for (const page of Array.isArray(projects) ? projects : []) {
    if (page?.type !== "pdf") continue;
    const ann = normalizePdfAnnotations(page.pdfAnnotations);
    if (annotationCount(ann)) out[page.id] = ann;
  }
  return out;
}

function writeAnnotationSidecar(projects) {
  const key = annotationKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(annotationSidecar(projects)));
  } catch {
    /* quota */
  }
}

function readAnnotationSidecar() {
  const key = annotationKey();
  if (!key) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function applyAnnotationSidecar(projects) {
  const extra = readAnnotationSidecar();
  return (Array.isArray(projects) ? projects : []).map((page) => {
    if (!page || page.type !== "pdf") return page;
    return {
      ...page,
      pdfAnnotations: mergePdfAnnotationMaps(page.pdfAnnotations, extra[page.id]),
    };
  });
}

function normalizeInkWidth(value) {
  const w = Number(value);
  if (!Number.isFinite(w) || w <= 0) return 0.004;
  if (w > 1) return Math.min(0.08, Math.max(0.0008, w / 800));
  return Math.min(0.08, Math.max(0.0008, w));
}

function migrateProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects.map((page) => {
    if (!page || typeof page !== "object") return page;
    if (page.type === "pdf") {
      return {
        ...page,
        type: "pdf",
        pdfUri: page.pdfUri || "",
        pdfName: page.pdfName || "",
        pdfSize: Number(page.pdfSize) || 0,
        pdfPage: Math.max(1, Number(page.pdfPage) || 1),
        pdfAnnotations: normalizePdfAnnotations(page.pdfAnnotations),
        pdfNotes: String(page.pdfNotes || ""),
        blocks: Array.isArray(page.blocks) ? page.blocks : [],
      };
    }
    const type = page.type === "folder" || page.type === "page" ? page.type : String(page.icon || "") === "F" ? "folder" : "page";
    if (type === "folder") return { ...page, type, blocks: [] };
    return ensurePageTabs({ ...page, type });
  });
}

function normalizeHexColor(color) {
  const hex = String(color || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : "";
}

function normalizeCoursePresetColors(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : defaultCoursePresetColors()) {
    const hex = normalizeHexColor(item);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out;
}

function normalizeCustomThemePresets(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const hex = normalizeHexColor(item);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out;
}

function normalizeSlot(slot) {
  return {
    day: Math.min(7, Math.max(1, Number(slot?.day) || 1)),
    startTime: slot?.startTime || "09:00",
    endTime: slot?.endTime || "10:00",
  };
}

export function normalizeSlots(slots) {
  const list = (Array.isArray(slots) ? slots : []).map(normalizeSlot);
  return list.length ? list : [normalizeSlot({})];
}

export function courseSlots(course) {
  if (!course) return [normalizeSlot({})];
  if (Array.isArray(course.slots) && course.slots.length) return course.slots.map(normalizeSlot);
  return [normalizeSlot(course)];
}

function migrateCourses(list) {
  return (Array.isArray(list) ? list : []).map((course) => {
    const slots = courseSlots(course);
    return {
      id: course.id || uid("course"),
      title: course.title,
      professor: course.professor || "",
      room: course.room || "",
      color: course.color,
      memo: course.memo || "",
      slots,
    };
  });
}

function makeTimetable(name, courses, id) {
  return {
    id: id || uid("tt"),
    name: String(name || "").trim() || "시간표",
    courses: migrateCourses(courses),
  };
}

function normalizeTimetable(item) {
  if (!item || typeof item !== "object") return null;
  return makeTimetable(item.name, item.courses, item.id);
}

function migrateTimetableState(data, fallback) {
  const source = data && typeof data === "object" ? data : {};
  const legacyCourses = Array.isArray(source.courses) ? source.courses : [];
  let tables = (Array.isArray(source.timetables) ? source.timetables : []).map(normalizeTimetable).filter(Boolean);
  if (!tables.length) {
    if (legacyCourses.length) {
      tables = [makeTimetable("기본 시간표", legacyCourses)];
    } else if (Array.isArray(fallback?.timetables) && fallback.timetables.length) {
      tables = fallback.timetables.map(normalizeTimetable).filter(Boolean);
    } else {
      tables = [makeTimetable("기본 시간표", [])];
    }
  } else if (legacyCourses.length && tables.every((item) => !item.courses.length)) {
    tables = [{ ...tables[0], courses: migrateCourses(legacyCourses) }, ...tables.slice(1)];
  }
  const primary = tables.some((item) => item.id === source.primaryTimetableId)
    ? source.primaryTimetableId
    : tables.some((item) => item.id === fallback?.primaryTimetableId)
      ? fallback.primaryTimetableId
      : tables[0].id;
  return { timetables: tables, primaryTimetableId: primary };
}

function nextTimetableName(list) {
  const names = new Set((list || []).map((item) => item.name));
  let n = (list || []).length + 1;
  while (names.has(`시간표 ${n}`)) n += 1;
  return `시간표 ${n}`;
}

function resolveTimetableId(timetableId) {
  const list = state.timetables || [];
  if (timetableId && list.some((item) => item.id === timetableId)) return timetableId;
  if (list.some((item) => item.id === state.primaryTimetableId)) return state.primaryTimetableId;
  return list[0]?.id || "";
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizePriority(value) {
  return value === "high" || value === "low" ? value : "normal";
}

function normalizeRepeat(value) {
  if (!value || typeof value !== "object") return null;
  const freq = value.freq === "weekly" ? "weekly" : value.freq === "daily" ? "daily" : "";
  if (!freq) return null;
  const until = isDateKey(value.until) ? value.until : null;
  const seriesId = String(value.seriesId || "").trim();
  return seriesId ? { freq, until, seriesId } : { freq, until };
}

function normalizeSubtasks(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const title = String(item?.title || "").trim();
      if (!title) return null;
      return { id: item.id || uid("sub"), title, done: Boolean(item.done) };
    })
    .filter(Boolean);
}

function normalizeTask(task) {
  if (!task || typeof task !== "object") return null;
  return {
    ...task,
    priority: normalizePriority(task.priority),
    repeat: normalizeRepeat(task.repeat),
    subtasks: normalizeSubtasks(task.subtasks),
  };
}

function pruneOrphanTasks(tasks, groups) {
  const ids = new Set((groups || []).map((group) => group.id));
  return (Array.isArray(tasks) ? tasks : [])
    .map(normalizeTask)
    .filter((task) => task && (!task.groupId || ids.has(task.groupId)));
}

function seriesKey(task) {
  return task.repeat?.seriesId || task.id;
}

function nextRepeatDate(dateKey, freq) {
  return formatDateKey(addDays(parseDateKey(dateKey), freq === "weekly" ? 7 : 1));
}

function firstRepeatOnOrAfter(fromKey, freq, today) {
  let cursor = fromKey;
  for (let i = 0; i < 800 && cursor < today; i += 1) cursor = nextRepeatDate(cursor, freq);
  return cursor;
}

function shiftDateKey(dateKey, fromKey, toKey) {
  if (!isDateKey(dateKey) || !isDateKey(fromKey) || !isDateKey(toKey)) return dateKey;
  const delta = Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
  return formatDateKey(addDays(parseDateKey(dateKey), delta));
}

function collectRecurringClones(tasks, today) {
  const list = Array.isArray(tasks) ? tasks : [];
  const extras = [];
  const seen = new Set();
  const latestBySeries = new Map();
  for (const task of list) {
    if (!task.repeat?.freq || !isDateKey(task.scheduledDate)) continue;
    const key = seriesKey(task);
    const prev = latestBySeries.get(key);
    if (!prev || task.scheduledDate > prev.scheduledDate) latestBySeries.set(key, task);
  }
  for (const [key, latest] of latestBySeries) {
    const freq = latest.repeat.freq;
    let next = "";
    if (latest.scheduledDate < today) next = firstRepeatOnOrAfter(nextRepeatDate(latest.scheduledDate, freq), freq, today);
    else if (latest.scheduledDate === today && latest.status === "completed") next = nextRepeatDate(today, freq);
    else continue;
    if (!isDateKey(next)) continue;
    if (latest.repeat.until && next > latest.repeat.until) continue;
    const exists = list.some((task) => seriesKey(task) === key && task.scheduledDate === next);
    if (exists || seen.has(`${key}:${next}`)) continue;
    seen.add(`${key}:${next}`);
    extras.push({
      ...latest,
      id: uid("task"),
      status: "todo",
      focusedSeconds: 0,
      scheduledDate: next,
      dueDate: latest.dueDate ? shiftDateKey(latest.dueDate, latest.scheduledDate, next) : latest.dueDate,
      subtasks: normalizeSubtasks(latest.subtasks).map((item) => ({ ...item, id: uid("sub"), done: false })),
      repeat: { ...latest.repeat, seriesId: key },
    });
  }
  return extras;
}

function isGroupMember(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  return Boolean(group?.memberIds?.includes(state.currentMemberId));
}

function mergeSettings(base, extra) {
  const a = { ...defaultSettings(), ...base };
  const b = extra || {};
  const notes = { ...a.notifications, ...b.notifications };
  delete notes.dailyReport;
  const mode = b.themeMode ?? a.themeMode ?? "system";
  const credits = Number(b.graduationCredits ?? a.graduationCredits);
  return {
    ...a,
    ...b,
    themeMode: ["light", "dark", "system"].includes(mode) ? mode : "system",
    graduationCredits: Number.isFinite(credits) && credits > 0 ? Math.min(400, Math.round(credits)) : 130,
    notifications: {
      groupUpdates: notes.groupUpdates !== false,
    },
  };
}

function migrateNotifications(list) {
  return (Array.isArray(list) ? list : []).filter(
    (item) => item && item.type !== "daily" && item.title !== "AI 코치",
  );
}

function omitRetiredFields(data) {
  if (!data || typeof data !== "object") return {};
  const { posts: _posts, dailyReports: _dailyReports, feed: _feed, ...rest } = data;
  return rest;
}

export function calcGpa(records, { majorOnly = false } = {}) {
  const rows = majorOnly ? records.filter((row) => row.isMajor) : records;
  const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const points45 = rows.reduce((sum, row) => sum + Number(row.credit || 0) * (GRADE_POINTS_45[row.grade] ?? 0), 0);
  const points43 = rows.reduce((sum, row) => sum + Number(row.credit || 0) * (GRADE_POINTS_43[row.grade] ?? 0), 0);
  return {
    totalCredit,
    points45,
    points43,
    gpa45: totalCredit ? points45 / totalCredit : 0,
    gpa43: totalCredit ? points43 / totalCredit : 0,
  };
}

function inviteCode(existing) {
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]).join("");
  } while (existing.includes(code));
  return code;
}

function seed(now = new Date()) {
  const today = formatDateKey(now);
  const defaultTt = makeTimetable("기본 시간표", []);

  return {
    categories: [
      { id: "school", name: "학교", color: CATEGORY_COLORS.school },
      { id: "work", name: "업무", color: CATEGORY_COLORS.work },
      { id: "personal", name: "개인 프로젝트", color: CATEGORY_COLORS.personal },
      { id: "exercise", name: "운동", color: CATEGORY_COLORS.exercise },
    ],
    tasks: [],
    events: [],
    timetables: [defaultTt],
    primaryTimetableId: defaultTt.id,
    coursePresetColors: defaultCoursePresetColors(),
    customThemePresets: [],
    gradeRecords: [],
    projects: [],
    groups: [],
    members: [{ id: "member-me", name: "나" }],
    currentMemberId: "member-me",
    profile: { nickname: "", photoUrl: "", bio: "" },
    settings: defaultSettings(),
    sessions: [],
    activeTimer: null,
    auxiliaryTimer: null,
    notifications: [],
    seenAssignedTaskIds: [],
    meta: {
      lastVisitDate: today,
      focusSection: "timer",
      selectedDate: today,
    },
  };
}

function seededState() {
  const base = seed();
  return { ...base, projects: migrateProjects(base.projects) };
}

function stateFromRaw(raw) {
  const parsed = omitRetiredFields(typeof raw === "string" ? JSON.parse(raw) : raw);
  const base = seed();
  const { courses: _legacyCourses, ...rest } = parsed;
  const tt = migrateTimetableState(parsed);
  return {
    ...base,
    ...rest,
    ...tt,
    categories: parsed.categories?.length ? parsed.categories : base.categories,
    members: parsed.members?.length ? parsed.members : base.members,
    profile: { nickname: "", photoUrl: "", bio: "", ...base.profile, ...(parsed.profile || {}) },
    settings: mergeSettings(base.settings, parsed.settings),
    coursePresetColors: normalizeCoursePresetColors(parsed.coursePresetColors ?? base.coursePresetColors),
    customThemePresets: normalizeCustomThemePresets(parsed.customThemePresets ?? base.customThemePresets),
    gradeRecords: Array.isArray(parsed.gradeRecords) ? parsed.gradeRecords : base.gradeRecords,
    projects: applyAnnotationSidecar(migrateProjects(Array.isArray(parsed.projects) ? parsed.projects : base.projects)),
    tasks: pruneOrphanTasks(parsed.tasks ?? base.tasks, parsed.groups ?? base.groups),
    notifications: migrateNotifications(parsed.notifications ?? base.notifications),
    seenAssignedTaskIds: Array.isArray(parsed.seenAssignedTaskIds)
      ? parsed.seenAssignedTaskIds.filter(Boolean).slice(-200)
      : base.seenAssignedTaskIds,
    meta: { ...base.meta, ...parsed.meta },
  };
}

let state = seededState();
const listeners = new Set();
let persistTimer = 0;
let remoteSave = null;

function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = 0;
  if (!persistEnabled || !activeUserId) return;
  const { courses: _legacyCourses, groups: _groups, ...clean } = omitRetiredFields(state);
  const payload = {
    ...clean,
    ...migrateTimetableState(state),
    groups: [],
    currentMemberId: activeUserId,
    settings: mergeSettings(defaultSettings(), state.settings),
    notifications: migrateNotifications(state.notifications),
  };
  const localPayload = { ...payload, groups: Array.isArray(state.groups) ? state.groups : [] };
  writeAnnotationSidecar(state.projects);
  const key = storageKey();
  try {
    if (key) localStorage.setItem(key, JSON.stringify(localPayload));
  } catch {
    /* quota — annotations still live in the sidecar key */
  }
  remoteSave?.(payload);
}

export function flushPersist() {
  persistNow();
}

export function setPersistEnabled(on) {
  persistEnabled = Boolean(on);
}

export function bindAccount(userId) {
  const next = userId ? String(userId) : "";
  if (activeUserId && activeUserId !== next) persistNow();
  activeUserId = next || null;
  if (!activeUserId) {
    state = seededState();
    listeners.forEach((fn) => fn(state));
    return;
  }
  try {
    const raw = localStorage.getItem(storageKey());
    state = raw ? stateFromRaw(raw) : seededState();
  } catch {
    state = seededState();
  }
  state = { ...state, currentMemberId: activeUserId };
  if (!materializeRecurringTasks().length) listeners.forEach((fn) => fn(state));
}

export function setCurrentMemberId(id) {
  const next = String(id || "");
  if (!next || state.currentMemberId === next) return;
  state = { ...state, currentMemberId: next };
  emit();
}

export function setGroups(groups) {
  const list = Array.isArray(groups) ? groups : [];
  state = {
    ...state,
    groups: list,
    tasks: pruneOrphanTasks(state.tasks, list),
  };
  emit();
}

export function upsertGroup(group) {
  if (!group?.id) return null;
  const idx = state.groups.findIndex((item) => item.id === group.id);
  const groups =
    idx >= 0
      ? state.groups.map((item) => (item.id === group.id ? { ...item, ...group } : item))
      : [group, ...state.groups];
  state = { ...state, groups };
  emit();
  return group;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", persistNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistNow();
  });
}

function emit() {
  listeners.forEach((fn) => fn(state));
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistNow(), 280);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function exportBackupPayload() {
  const {
    activeTimer: _timer,
    auxiliaryTimer: _aux,
    currentMemberId: _member,
    seenAssignedTaskIds: _seen,
    ...rest
  } = omitRetiredFields(state);
  const settings = { ...(rest.settings || {}) };
  if (settings.customFont && typeof settings.customFont === "object") {
    settings.customFont = { name: settings.customFont.name || "업로드 폰트" };
  }
  const profile = { nickname: "", bio: "", ...(rest.profile || {}) };
  if (typeof profile.photoUrl === "string" && profile.photoUrl.startsWith("data:")) {
    profile.photoUrl = "";
  }
  return {
    exportedAt: new Date().toISOString(),
    app: "focusuniv",
    version: 1,
    categories: rest.categories || [],
    tasks: rest.tasks || [],
    events: rest.events || [],
    timetables: rest.timetables || [],
    primaryTimetableId: rest.primaryTimetableId || "",
    coursePresetColors: rest.coursePresetColors || [],
    customThemePresets: rest.customThemePresets || [],
    gradeRecords: rest.gradeRecords || [],
    projects: rest.projects || [],
    groups: rest.groups || [],
    members: rest.members || [],
    profile,
    settings,
    sessions: rest.sessions || [],
    notifications: rest.notifications || [],
    meta: rest.meta || {},
  };
}

export function exportGpaCsv() {
  const rows = Array.isArray(state.gradeRecords) ? state.gradeRecords : [];
  const lines = ["학기,과목명,학점,성적,전공여부"];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.semester),
        csvCell(row.title),
        csvCell(row.credit),
        csvCell(row.grade),
        csvCell(row.isMajor ? "전공" : "교양"),
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}`;
}

export function purgeLocalAccount() {
  persistEnabled = false;
  clearTimeout(persistTimer);
  persistTimer = 0;
  const key = storageKey();
  const ann = annotationKey();
  try {
    if (key) localStorage.removeItem(key);
    if (ann) localStorage.removeItem(ann);
  } catch {
    /* ignore */
  }
  activeUserId = null;
  state = seededState();
  persistEnabled = true;
  listeners.forEach((fn) => fn(state));
}

export function setRemoteSaver(fn) {
  remoteSave = fn;
}

export function replaceState(next) {
  const incoming = omitRetiredFields(next);
  const { courses: _legacyCourses, ...rest } = incoming;
  const tt = migrateTimetableState(incoming, state);
  state = {
    ...seed(),
    ...rest,
    ...tt,
    profile: { nickname: "", photoUrl: "", bio: "", ...state.profile, ...incoming.profile },
    settings: mergeSettings(state.settings, incoming.settings),
    meta: { ...state.meta, ...incoming.meta },
    coursePresetColors: normalizeCoursePresetColors(incoming.coursePresetColors ?? state.coursePresetColors),
    customThemePresets: normalizeCustomThemePresets(incoming.customThemePresets ?? state.customThemePresets),
    projects: applyAnnotationSidecar(
      mergePdfProjectFields(migrateProjects(incoming.projects ?? state.projects), state.projects),
    ),
    tasks: pruneOrphanTasks(incoming.tasks ?? state.tasks, incoming.groups ?? state.groups),
    notifications: migrateNotifications(incoming.notifications ?? state.notifications),
    seenAssignedTaskIds: Array.isArray(incoming.seenAssignedTaskIds)
      ? incoming.seenAssignedTaskIds.filter(Boolean).slice(-200)
      : state.seenAssignedTaskIds || [],
    currentMemberId: activeUserId || incoming.currentMemberId || state.currentMemberId,
  };
  const extras = collectRecurringClones(state.tasks, formatDateKey(new Date()));
  if (extras.length) state = { ...state, tasks: [...state.tasks, ...extras] };
  emit();
}

function assigneeMatchesMine(name, mineNames) {
  const raw = String(name || "").trim();
  if (!raw || !mineNames?.size) return false;
  if (mineNames.has(raw)) return true;
  const wrapped = raw.match(/^나\((.+)\)$/);
  return Boolean(wrapped && mineNames.has(wrapped[1].trim()));
}

export function tasksOn(dateKey) {
  return state.tasks.filter((task) => {
    if (task.groupId) {
      if (!isGroupMember(task.groupId)) return false;
      if (task.dueDate) return dateKey <= task.dueDate && task.status !== "completed";
    }
    return task.scheduledDate === dateKey;
  });
}

function daysBetween(fromKey, toKey) {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) return Number.POSITIVE_INFINITY;
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
}

export function upcomingDeadlines(days = 7) {
  const today = formatDateKey(new Date());
  const limit = Number.isFinite(Number(days)) ? Number(days) : 7;
  return state.tasks
    .filter((task) => {
      if (!task.dueDate || task.status === "completed") return false;
      if (task.groupId && !isGroupMember(task.groupId)) return false;
      return daysBetween(today, task.dueDate) <= limit;
    })
    .sort((a, b) => {
      if (a.dueDate === b.dueDate) return 0;
      return a.dueDate < b.dueDate ? -1 : 1;
    });
}

export function tasksInGroup(groupId) {
  return state.tasks.filter((task) => task.groupId === groupId);
}

export function projectsInGroup(groupId) {
  return state.projects.filter((page) => page.groupId === groupId && !page.parentId);
}

export function progressOn(dateKey) {
  return dayProgress(tasksOn(dateKey));
}

function mondayOfWeek(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = date.getDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function sessionSeconds(session) {
  return Math.max(0, Number(session?.durationSeconds) || 0);
}

export function focusStreak(now = new Date()) {
  const days = new Set(
    (state.sessions || [])
      .filter((session) => sessionSeconds(session) > 0 && isDateKey(session.date))
      .map((session) => session.date),
  );
  let streak = 0;
  let cursor = formatDateKey(now);
  while (days.has(cursor)) {
    streak += 1;
    cursor = formatDateKey(addDays(parseDateKey(cursor), -1));
  }
  return streak;
}

export function weeklyFocusSummary(now = new Date()) {
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  const start = mondayOfWeek(now);
  const days = labels.map((label, index) => ({
    date: formatDateKey(addDays(start, index)),
    weekday: index + 1,
    label,
    seconds: 0,
    byCategory: {},
  }));
  const byDate = Object.fromEntries(days.map((day) => [day.date, day]));
  const byCategory = {};
  let totalSeconds = 0;
  for (const session of state.sessions || []) {
    const row = byDate[session.date];
    if (!row) continue;
    const seconds = sessionSeconds(session);
    if (!seconds) continue;
    const categoryId = session.categoryId || "none";
    row.seconds += seconds;
    row.byCategory[categoryId] = (row.byCategory[categoryId] || 0) + seconds;
    byCategory[categoryId] = (byCategory[categoryId] || 0) + seconds;
    totalSeconds += seconds;
  }
  return {
    weekStart: days[0].date,
    weekEnd: days[6].date,
    days,
    totalSeconds,
    byCategory,
  };
}

export function categoryById(id) {
  return state.categories.find((item) => item.id === id);
}

export function projectById(id) {
  return state.projects.find((item) => item.id === id);
}

function plainSearchText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function projectSearchText(page) {
  const blocks =
    Array.isArray(page?.tabs) && page.tabs.length
      ? page.tabs.flatMap((tab) => tab.blocks || [])
      : page?.blocks || [];
  const parts = [page?.name];
  for (const block of blocks) {
    if (block?.name) parts.push(block.name);
    if (block?.text) parts.push(plainSearchText(block.text));
    if (Array.isArray(block?.headers)) parts.push(...block.headers);
    if (Array.isArray(block?.rows)) parts.push(...block.rows.flat());
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function noteMatches(page, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return projectSearchText(page).includes(q);
}

export function globalSearch(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const task of state.tasks || []) {
    if (task.groupId && !isGroupMember(task.groupId)) continue;
    const hay = `${task.title || ""} ${task.note || ""}`.toLowerCase();
    if (!hay.includes(q)) continue;
    const group = (state.groups || []).find((item) => item.id === task.groupId);
    hits.push({
      type: "task",
      id: task.id,
      label: task.title || "할 일",
      meta: [group?.name, task.dueDate || task.scheduledDate].filter(Boolean).join(" · "),
      route: task.groupId ? `/groups/${task.groupId}` : "/today",
    });
  }
  for (const table of state.timetables || []) {
    for (const course of table.courses || []) {
      const hay = `${course.title || ""} ${course.name || ""} ${course.professor || ""} ${course.room || ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
      hits.push({
        type: "course",
        id: course.id,
        label: course.title || course.name || "수업",
        meta: [table.name, course.professor, course.room].filter(Boolean).join(" · "),
        route: "/timetable",
        timetableId: table.id,
      });
    }
  }
  for (const group of state.groups || []) {
    if (!String(group.name || "").toLowerCase().includes(q)) continue;
    hits.push({
      type: "group",
      id: group.id,
      label: group.name || "그룹",
      meta: `${(group.memberIds || []).length}명`,
      route: `/groups/${group.id}`,
    });
  }
  for (const page of state.projects || []) {
    if (!noteMatches(page, q)) continue;
    const group = page.groupId ? (state.groups || []).find((item) => item.id === page.groupId) : null;
    hits.push({
      type: "project",
      id: page.id,
      label: page.name || "제목 없음",
      meta: group?.name || "프로젝트",
      route: page.groupId ? `/groups/${page.groupId}/projects/${page.id}` : `/projects/${page.id}`,
    });
  }
  return hits.slice(0, 40);
}

export function childPages(parentId, scopeGroupId) {
  return state.projects.filter((page) => {
    if (page.parentId !== parentId) return false;
    if (scopeGroupId === undefined) return true;
    return (page.groupId || null) === (scopeGroupId || null);
  });
}

export function rootPages(scopeGroupId) {
  return state.projects.filter((page) => {
    if (page.parentId) return false;
    if (scopeGroupId === undefined) return true;
    return (page.groupId || null) === (scopeGroupId || null);
  });
}

export function elapsedNow(now = Date.now()) {
  return focusElapsed(state.activeTimer, now);
}

export function remainingNow(now = Date.now()) {
  return auxiliaryRemaining(state.auxiliaryTimer, now);
}

export function unreadCount() {
  return state.notifications.filter((item) => !item.read).length;
}

function localSelfNames() {
  const names = new Set(["나"]);
  const nick = String(state.profile?.nickname || "").trim();
  if (nick) {
    names.add(nick);
    names.add(`나(${nick})`);
  }
  return names;
}

function notificationDuplicate(note) {
  return state.notifications.some((item) => {
    if (item.type !== note.type) return false;
    if (note.pollId) return item.pollId === note.pollId;
    if (note.taskId) return item.taskId === note.taskId;
    if (note.type === "group-join") return item.groupId === note.groupId && item.body === note.body;
    return false;
  });
}

export function rememberAssignedTaskIds(ids) {
  const incoming = [...new Set((ids || []).filter(Boolean))];
  if (!incoming.length) return;
  const seen = new Set(state.seenAssignedTaskIds || []);
  let changed = false;
  for (const id of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    changed = true;
  }
  if (!changed) return;
  state = { ...state, seenAssignedTaskIds: [...seen].slice(-200) };
  emit();
}

export function takeNewAssignedTaskIds(ids) {
  const incoming = [...new Set((ids || []).filter(Boolean))];
  if (!state.meta?.assignedAlertsSeeded) {
    state = {
      ...state,
      seenAssignedTaskIds: incoming.slice(-200),
      meta: { ...state.meta, assignedAlertsSeeded: true },
    };
    emit();
    return [];
  }
  const seen = new Set(state.seenAssignedTaskIds || []);
  const fresh = incoming.filter((id) => !seen.has(id));
  if (!fresh.length) return [];
  state = { ...state, seenAssignedTaskIds: [...seen, ...fresh].slice(-200) };
  emit();
  return fresh;
}

export function pushNotification(input = {}) {
  const type = String(input.type || "info");
  if ((type === "group-join" || type === "task-assign") && state.settings?.notifications?.groupUpdates === false) {
    return null;
  }
  const note = {
    id: uid("notif"),
    type,
    title: String(input.title || "").trim() || "알림",
    body: String(input.body || "").trim(),
    groupId: input.groupId || undefined,
    taskId: input.taskId || undefined,
    pollId: input.pollId || undefined,
    read: false,
    createdAt: Date.now(),
  };
  if (notificationDuplicate(note)) return null;
  state = { ...state, notifications: [note, ...state.notifications].slice(0, 40) };
  emit();
  return note;
}

export function markNotificationsRead() {
  state = {
    ...state,
    notifications: state.notifications.map((item) => ({ ...item, read: true })),
  };
  emit();
}

export function materializeRecurringTasks(today = formatDateKey(new Date())) {
  const extras = collectRecurringClones(state.tasks, today);
  if (!extras.length) return [];
  state = { ...state, tasks: [...state.tasks, ...extras] };
  emit();
  return extras;
}

export function addTask(input) {
  const repeat = normalizeRepeat(input.repeat);
  const task = {
    id: uid("task"),
    title: input.title.trim(),
    note: input.note?.trim() || "",
    categoryId: input.categoryId,
    projectId: input.projectId || undefined,
    groupId: input.groupId || undefined,
    assigneeName: String(input.assigneeName || "").trim(),
    scheduledDate: input.scheduledDate,
    status: "todo",
    focusedSeconds: 0,
    priority: normalizePriority(input.priority),
    repeat: repeat ? { ...repeat, seriesId: repeat.seriesId || uid("series") } : null,
    subtasks: normalizeSubtasks(input.subtasks),
  };
  if (isDateKey(input.dueDate)) task.dueDate = input.dueDate;
  state = { ...state, tasks: [...state.tasks, task] };
  if (task.groupId && task.assigneeName) {
    if (assigneeMatchesMine(task.assigneeName, localSelfNames())) {
      rememberAssignedTaskIds([task.id]);
    } else {
      pushNotification({
        type: "task-assign",
        title: "할 일을 배정했습니다",
        body: `${task.assigneeName} · ${task.title}`,
        groupId: task.groupId,
        taskId: task.id,
      });
    }
  }
  emit();
  return task;
}

export function toggleTask(taskId) {
  state = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, status: task.status === "completed" ? "todo" : "completed" } : task,
    ),
  };
  emit();
  materializeRecurringTasks();
}

export function updateTask(taskId, changes) {
  state = {
    ...state,
    tasks: state.tasks.map((task) => {
      if (task.id !== taskId) return task;
      const next = { ...task, ...changes };
      if ("priority" in changes) next.priority = normalizePriority(changes.priority);
      if ("repeat" in changes) {
        const repeat = normalizeRepeat(changes.repeat);
        next.repeat = repeat ? { ...repeat, seriesId: repeat.seriesId || task.repeat?.seriesId || uid("series") } : null;
      }
      if ("subtasks" in changes) next.subtasks = normalizeSubtasks(changes.subtasks);
      if ("dueDate" in changes) next.dueDate = isDateKey(changes.dueDate) ? changes.dueDate : undefined;
      return next;
    }),
  };
  emit();
}

export function addSubtask(taskId, title) {
  const label = String(title || "").trim();
  if (!label) return null;
  const item = { id: uid("sub"), title: label, done: false };
  state = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, subtasks: [...normalizeSubtasks(task.subtasks), item] } : task,
    ),
  };
  emit();
  return item;
}

export function toggleSubtask(taskId, subId) {
  state = {
    ...state,
    tasks: state.tasks.map((task) => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        subtasks: normalizeSubtasks(task.subtasks).map((item) =>
          item.id === subId ? { ...item, done: !item.done } : item,
        ),
      };
    }),
  };
  emit();
}

export function deleteSubtask(taskId, subId) {
  state = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, subtasks: normalizeSubtasks(task.subtasks).filter((item) => item.id !== subId) } : task,
    ),
  };
  emit();
}

export function deleteTask(taskId) {
  state = { ...state, tasks: state.tasks.filter((task) => task.id !== taskId) };
  emit();
}

export function addCategory(name, color) {
  const category = { id: uid("cat"), name: name.trim(), color };
  state = { ...state, categories: [...state.categories, category] };
  emit();
}

export function deleteCategory(id) {
  if (["school", "work", "personal", "exercise"].includes(id)) return;
  state = { ...state, categories: state.categories.filter((item) => item.id !== id) };
  emit();
}

export function updateCategory(id, changes) {
  state = {
    ...state,
    categories: state.categories.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  };
  emit();
}

export function addEvent(input) {
  const event = { id: uid("event"), ...input };
  state = { ...state, events: [...state.events, event] };
  emit();
}

export function deleteEvent(id) {
  state = { ...state, events: state.events.filter((item) => item.id !== id) };
  emit();
}

export function eventsOn(dateKey) {
  const key = String(dateKey || "");
  return (state.events || []).filter((event) => event.date === key);
}

export function addCourse(input, timetableId) {
  const course = {
    id: uid("course"),
    title: String(input.title || "").trim(),
    professor: String(input.professor || "").trim(),
    room: String(input.room || "").trim(),
    color: input.color || CATEGORY_COLORS.school,
    memo: String(input.memo || "").trim(),
    slots: normalizeSlots(input.slots),
  };
  const target = resolveTimetableId(timetableId);
  state = {
    ...state,
    timetables: (state.timetables || []).map((item) =>
      item.id === target ? { ...item, courses: [...item.courses, course] } : item,
    ),
  };
  emit();
  return course;
}

export function updateCourse(id, changes) {
  state = {
    ...state,
    timetables: (state.timetables || []).map((item) => ({
      ...item,
      courses: item.courses.map((course) => {
        if (course.id !== id) return course;
        const next = { ...course, ...changes };
        if (changes.title != null) next.title = String(changes.title).trim();
        if (changes.professor != null) next.professor = String(changes.professor).trim();
        if (changes.room != null) next.room = String(changes.room).trim();
        if (changes.memo != null) next.memo = String(changes.memo).trim();
        if (changes.slots != null) next.slots = normalizeSlots(changes.slots);
        return next;
      }),
    })),
  };
  emit();
}

export function deleteCourse(id) {
  state = {
    ...state,
    timetables: (state.timetables || []).map((item) => ({
      ...item,
      courses: item.courses.filter((course) => course.id !== id),
    })),
  };
  emit();
}

export function getTimetables() {
  return state.timetables || [];
}

export function primaryTimetable() {
  const list = state.timetables || [];
  return list.find((item) => item.id === state.primaryTimetableId) || list[0] || makeTimetable("기본 시간표", []);
}

export function primaryCourses() {
  return primaryTimetable().courses || [];
}

export function coursesIn(timetableId) {
  const list = state.timetables || [];
  const found = list.find((item) => item.id === timetableId);
  return (found || primaryTimetable()).courses || [];
}

export function courseById(id) {
  for (const item of state.timetables || []) {
    const course = item.courses.find((entry) => entry.id === id);
    if (course) return course;
  }
  return null;
}

export function timetableIdForCourse(id) {
  for (const item of state.timetables || []) {
    if (item.courses.some((entry) => entry.id === id)) return item.id;
  }
  return "";
}

export function addTimetable(name) {
  const list = state.timetables || [];
  const tt = makeTimetable(String(name || "").trim() || nextTimetableName(list), []);
  state = { ...state, timetables: [...list, tt] };
  emit();
  return tt;
}

export function duplicateTimetable(id, newName) {
  const list = state.timetables || [];
  const source = list.find((item) => item.id === id);
  if (!source) return null;
  const copied = migrateCourses(source.courses).map((course) => ({
    ...course,
    id: uid("course"),
    slots: (course.slots || []).map((slot) => ({ ...slot })),
  }));
  const fallback = `${source.name || "시간표"} 복사`;
  const tt = makeTimetable(String(newName || "").trim() || fallback, copied);
  state = { ...state, timetables: [...list, tt] };
  emit();
  return tt;
}

export function renameTimetable(id, name) {
  const next = String(name || "").trim();
  if (!next) return;
  state = {
    ...state,
    timetables: (state.timetables || []).map((item) => (item.id === id ? { ...item, name: next } : item)),
  };
  emit();
}

export function setPrimaryTimetable(id) {
  if (!(state.timetables || []).some((item) => item.id === id)) return false;
  state = { ...state, primaryTimetableId: id };
  emit();
  return true;
}

export function deleteTimetable(id) {
  const list = state.timetables || [];
  if (list.length <= 1) return false;
  const next = list.filter((item) => item.id !== id);
  if (!next.length) return false;
  const primary = next.some((item) => item.id === state.primaryTimetableId) ? state.primaryTimetableId : next[0].id;
  state = { ...state, timetables: next, primaryTimetableId: primary };
  emit();
  return true;
}

export function addCoursePresetColor(color) {
  const hex = normalizeHexColor(color);
  if (!hex) return;
  const current = normalizeCoursePresetColors(state.coursePresetColors);
  if (current.includes(hex)) return;
  state = { ...state, coursePresetColors: [...current, hex] };
  emit();
}

export function removeCoursePresetColor(color) {
  const hex = normalizeHexColor(color);
  if (!hex) return;
  const locked = new Set((state.categories || []).map((item) => normalizeHexColor(item.color)).filter(Boolean));
  if (locked.has(hex)) return;
  state = {
    ...state,
    coursePresetColors: normalizeCoursePresetColors(state.coursePresetColors).filter((item) => item !== hex),
  };
  emit();
}

export function addThemePreset(color) {
  const hex = normalizeHexColor(color);
  if (!hex) return;
  const current = normalizeCustomThemePresets(state.customThemePresets);
  if (current.includes(hex)) return;
  state = { ...state, customThemePresets: [...current, hex] };
  emit();
}

export function removeThemePreset(color) {
  const hex = normalizeHexColor(color);
  if (!hex) return;
  state = {
    ...state,
    customThemePresets: normalizeCustomThemePresets(state.customThemePresets).filter((item) => item !== hex),
  };
  emit();
}

export function addGradeRecord(input) {
  const record = {
    id: uid("grade"),
    semester: String(input.semester || "").trim() || "학기 미정",
    title: String(input.title || "").trim(),
    credit: Math.max(0, Number(input.credit) || 0),
    grade: GRADE_POINTS_45[input.grade] != null ? input.grade : "F",
    isMajor: Boolean(input.isMajor),
  };
  state = { ...state, gradeRecords: [...(state.gradeRecords || []), record] };
  emit();
  return record;
}

export function updateGradeRecord(id, changes) {
  state = {
    ...state,
    gradeRecords: (state.gradeRecords || []).map((record) => {
      if (record.id !== id) return record;
      const next = { ...record, ...changes };
      if (changes.semester != null) next.semester = String(changes.semester).trim() || record.semester;
      if (changes.title != null) next.title = String(changes.title).trim();
      if (changes.credit != null) next.credit = Math.max(0, Number(changes.credit) || 0);
      if (changes.grade != null && GRADE_POINTS_45[changes.grade] != null) next.grade = changes.grade;
      if (changes.isMajor != null) next.isMajor = Boolean(changes.isMajor);
      return next;
    }),
  };
  emit();
}

export function deleteGradeRecord(id) {
  state = { ...state, gradeRecords: (state.gradeRecords || []).filter((record) => record.id !== id) };
  emit();
}

export function startTimer(taskId) {
  state = {
    ...state,
    activeTimer: {
      taskId,
      startedAt: Date.now(),
      accumulatedSeconds: 0,
      isRunning: true,
    },
  };
  emit();
}

export function pauseTimer() {
  const timer = state.activeTimer;
  if (!timer?.isRunning) return;
  state = {
    ...state,
    activeTimer: {
      ...timer,
      accumulatedSeconds: focusElapsed(timer),
      startedAt: Date.now(),
      isRunning: false,
    },
  };
  emit();
}

export function resumeTimer() {
  const timer = state.activeTimer;
  if (!timer || timer.isRunning) return;
  state = { ...state, activeTimer: { ...timer, startedAt: Date.now(), isRunning: true } };
  emit();
}

export function finishTimer(taskTitle, categoryId) {
  const timer = state.activeTimer;
  if (!timer) return 0;
  const endTime = Date.now();
  const durationSeconds = focusElapsed(timer, endTime);
  if (durationSeconds <= 0) {
    state = { ...state, activeTimer: null, auxiliaryTimer: null };
    emit();
    return 0;
  }
  const session = {
    id: uid("session"),
    taskId: timer.taskId,
    taskTitle,
    categoryId,
    startTime: endTime - durationSeconds * 1000,
    endTime,
    durationSeconds,
    date: formatDateKey(new Date(endTime)),
  };
  const tasks = state.tasks.map((task) =>
    task.id === timer.taskId ? { ...task, focusedSeconds: task.focusedSeconds + durationSeconds } : task,
  );
  state = { ...state, activeTimer: null, auxiliaryTimer: null, sessions: [...state.sessions, session], tasks };
  emit();
  return durationSeconds;
}

export function autoFinishActiveTimer() {
  const timer = state.activeTimer;
  if (!timer) return 0;
  const task = state.tasks.find((item) => item.id === timer.taskId);
  const seconds = finishTimer(task?.title || "측정", task?.categoryId);
  persistNow();
  return seconds;
}

export function cancelTimer() {
  state = { ...state, activeTimer: null, auxiliaryTimer: null };
  emit();
}

export function startAuxiliary(seconds) {
  state = {
    ...state,
    auxiliaryTimer: {
      durationSeconds: seconds,
      remainingSeconds: seconds,
      endsAt: Date.now() + seconds * 1000,
      isRunning: true,
    },
  };
  emit();
}

export function pauseAuxiliary() {
  const timer = state.auxiliaryTimer;
  if (!timer?.isRunning) return;
  state = {
    ...state,
    auxiliaryTimer: {
      ...timer,
      remainingSeconds: auxiliaryRemaining(timer),
      endsAt: null,
      isRunning: false,
    },
  };
  emit();
}

export function resumeAuxiliary() {
  const timer = state.auxiliaryTimer;
  if (!timer || timer.isRunning || timer.remainingSeconds <= 0) return;
  state = {
    ...state,
    auxiliaryTimer: {
      ...timer,
      endsAt: Date.now() + timer.remainingSeconds * 1000,
      isRunning: true,
    },
  };
  emit();
}

export function stopAuxiliary() {
  state = { ...state, auxiliaryTimer: null };
  emit();
}

export function deleteSession(id) {
  state = { ...state, sessions: state.sessions.filter((session) => session.id !== id) };
  emit();
}

export function addPage({
  name,
  parentId = null,
  color = "#2563EB",
  icon = "N",
  groupId,
  type = "page",
  pdfUri = "",
  pdfName = "",
  pdfSize = 0,
  pdfPage = 1,
} = {}) {
  const kind = type === "folder" ? "folder" : type === "pdf" ? "pdf" : "page";
  const tabId = uid("tab");
  const blocks = kind === "page" ? [emptyParagraph()] : [];
  const page = {
    id: uid("page"),
    parentId,
    groupId: groupId || undefined,
    name:
      String(name || "").trim() ||
      (kind === "folder" ? "새로운 폴더" : kind === "pdf" ? "PDF" : "새로운 페이지"),
    color,
    icon: kind === "folder" ? "F" : kind === "pdf" ? "P" : String(icon || "N").slice(0, 1).toUpperCase(),
    type: kind,
    blocks,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (kind === "page") {
    page.tabs = [{ id: tabId, name: "탭 1", blocks }];
    page.activeTabId = tabId;
  }
  if (kind === "pdf") {
    page.pdfUri = pdfUri || "";
    page.pdfName = pdfName || "";
    page.pdfSize = Number(pdfSize) || 0;
    page.pdfPage = Math.max(1, Number(pdfPage) || 1);
    page.pdfAnnotations = normalizePdfAnnotations({});
    page.pdfNotes = "";
  }
  state = { ...state, projects: [...state.projects, page] };
  emit();
  return page;
}

export function updatePage(id, changes) {
  state = {
    ...state,
    projects: state.projects.map((page) =>
      page.id === id ? { ...page, ...changes, updatedAt: Date.now() } : page,
    ),
  };
  emit();
}

export function activeTab(page) {
  if (!page || page.type === "folder" || page.type === "pdf") return null;
  const tabs = Array.isArray(page.tabs) ? page.tabs : [];
  return tabs.find((tab) => tab.id === page.activeTabId) || tabs[0] || null;
}

export function pageBlocks(page) {
  return activeTab(page)?.blocks || page?.blocks || [];
}

function nextTabName(tabs) {
  const names = new Set((tabs || []).map((tab) => tab.name));
  let n = (tabs || []).length + 1;
  while (names.has(`탭 ${n}`)) n += 1;
  return `탭 ${n}`;
}

export function addPageTab(pageId, name) {
  const page = projectById(pageId);
  if (!page || page.type === "folder" || page.type === "pdf") return null;
  const current = ensurePageTabs(page);
  const tabs = current.tabs || [];
  const tab = {
    id: uid("tab"),
    name: String(name || "").trim() || nextTabName(tabs),
    blocks: [emptyParagraph()],
  };
  updatePage(pageId, {
    tabs: [...tabs, tab],
    activeTabId: tab.id,
    blocks: tab.blocks,
  });
  return tab;
}

export function renamePageTab(pageId, tabId, name) {
  const page = projectById(pageId);
  if (!page || page.type === "folder" || page.type === "pdf") return;
  const next = String(name || "").trim() || "이름 없는 탭";
  updatePage(pageId, {
    tabs: (page.tabs || []).map((tab) => (tab.id === tabId ? { ...tab, name: next } : tab)),
  });
}

export function deletePageTab(pageId, tabId) {
  const page = projectById(pageId);
  if (!page || page.type === "folder" || page.type === "pdf") return;
  const tabs = page.tabs || [];
  if (tabs.length <= 1) return;
  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  if (nextTabs.length === tabs.length) return;
  const active = nextTabs.find((tab) => tab.id === (page.activeTabId === tabId ? nextTabs[0].id : page.activeTabId)) || nextTabs[0];
  updatePage(pageId, { tabs: nextTabs, activeTabId: active.id, blocks: active.blocks });
}

export function setActiveTab(pageId, tabId) {
  const page = projectById(pageId);
  if (!page || page.type === "folder" || page.type === "pdf") return;
  const tab = (page.tabs || []).find((item) => item.id === tabId);
  if (!tab) return;
  updatePage(pageId, { activeTabId: tabId, blocks: tab.blocks });
}

export function setTabBlocks(pageId, tabId, blocks) {
  const page = projectById(pageId);
  if (!page || page.type === "folder" || page.type === "pdf" || !tabId) return;
  const tabs = Array.isArray(page.tabs) ? page.tabs : [];
  if (!tabs.some((tab) => tab.id === tabId)) return;
  const nextTabs = tabs.map((tab) => (tab.id === tabId ? { ...tab, blocks } : tab));
  const patch = { tabs: nextTabs };
  if (!page.activeTabId || page.activeTabId === tabId) patch.blocks = blocks;
  updatePage(pageId, patch);
}

export function setBlocks(pageId, blocks) {
  const page = projectById(pageId);
  if (!page || page.type === "folder" || page.type === "pdf") return;
  const tabId = page.activeTabId || page.tabs?.[0]?.id;
  if (tabId) setTabBlocks(pageId, tabId, blocks);
  else updatePage(pageId, { blocks });
}

export function deletePage(id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const page of state.projects) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        grew = true;
      }
    }
  }
  state = { ...state, projects: state.projects.filter((page) => !ids.has(page.id)) };
  emit();
}

export function createGroup(name) {
  const group = {
    id: uid("group"),
    name: name.trim(),
    inviteCode: inviteCode(state.groups.map((item) => item.inviteCode)),
    memberIds: [state.currentMemberId],
    createdAt: Date.now(),
  };
  state = { ...state, groups: [...state.groups, group] };
  emit();
  return group;
}

export function joinGroup(code) {
  if (state.settings?.rejectGroupInvites) return { ok: false, reason: "rejected" };
  const needle = code.trim().toUpperCase();
  const group = state.groups.find((item) => item.inviteCode === needle);
  if (!group) return { ok: false, reason: "missing" };
  if (group.memberIds.includes(state.currentMemberId)) return { ok: true, group };
  if (group.memberIds.length >= MAX_GROUP_MEMBERS) return { ok: false, reason: "full" };
  const joined = { ...group, memberIds: [...group.memberIds, state.currentMemberId] };
  state = {
    ...state,
    groups: state.groups.map((item) => (item.id === group.id ? joined : item)),
  };
  emit();
  return { ok: true, group: joined };
}

export function leaveGroup(groupId) {
  state = {
    ...state,
    groups: state.groups.filter((group) => group.id !== groupId),
    tasks: state.tasks.filter((task) => task.groupId !== groupId),
  };
  emit();
}

export function newBlock(type, text = "") {
  const block = { id: uid("block"), type, text };
  if (type === "checklist") block.checked = false;
  if (type === "toggle") block.open = true;
  block.indent = 0;
  if (type === "table") {
    block.headers = ["A", "B", "C"];
    block.rows = [
      ["", "", ""],
      ["", "", ""],
    ];
  }
  if (type === "code") block.language = "text";
  if (type === "callout") block.text = text || "메모";
  if (type === "file") {
    block.name = "";
    block.mime = "";
    block.size = 0;
    block.uri = "";
  }
  if (type === "pdf") {
    block.uri = "";
    block.name = "";
    block.size = 0;
    block.collapsed = false;
  }
  if (type === "toc") block.text = "";
  return block;
}

export function updateProfile(changes) {
  state = { ...state, profile: { ...state.profile, ...changes } };
  emit();
}

export function updateSettings(changes) {
  state = { ...state, settings: mergeSettings(state.settings, changes) };
  emit();
}

export { CATEGORY_COLORS, emptyParagraph, MAX_GROUP_MEMBERS };
