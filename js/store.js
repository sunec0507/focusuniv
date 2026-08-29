import {
  addDays,
  auxiliaryRemaining,
  dayProgress,
  focusElapsed,
  formatDateKey,
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
    notifications: { dailyReport: true, groupUpdates: true },
    fontSize: "md",
    fontFamily: "pretendard",
    themeColor: "#2563eb",
    themeSchool: null,
    themeBgTint: false,
    customFont: null,
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
      id: course.id,
      title: course.title,
      professor: course.professor || "",
      room: course.room || "",
      color: course.color,
      memo: course.memo || "",
      slots,
    };
  });
}

function pruneOrphanTasks(tasks, groups) {
  const ids = new Set((groups || []).map((group) => group.id));
  return (Array.isArray(tasks) ? tasks : []).filter((task) => !task.groupId || ids.has(task.groupId));
}

function isGroupMember(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  return Boolean(group?.memberIds?.includes(state.currentMemberId));
}

function mergeSettings(base, extra) {
  const a = { ...defaultSettings(), ...base };
  const b = extra || {};
  return {
    ...a,
    ...b,
    notifications: { ...a.notifications, ...b.notifications },
  };
}

export function calcGpa(records, { majorOnly = false } = {}) {
  const rows = majorOnly ? records.filter((row) => row.isMajor) : records;
  const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const points45 = rows.reduce((sum, row) => sum + Number(row.credit || 0) * (GRADE_POINTS_45[row.grade] ?? 0), 0);
  const points43 = rows.reduce((sum, row) => sum + Number(row.credit || 0) * (GRADE_POINTS_43[row.grade] ?? 0), 0);
  return {
    totalCredit,
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
  const yesterday = formatDateKey(addDays(now, -1));
  const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 12).getTime();

  const portfolio = uid("page");
  const research = uid("page");

  return {
    categories: [
      { id: "school", name: "학교", color: CATEGORY_COLORS.school },
      { id: "work", name: "업무", color: CATEGORY_COLORS.work },
      { id: "personal", name: "개인 프로젝트", color: CATEGORY_COLORS.personal },
      { id: "exercise", name: "운동", color: CATEGORY_COLORS.exercise },
    ],
    tasks: [
      {
        id: uid("task"),
        title: "전공 수업 복습",
        note: "3장까지 정리하기 · 예시 데이터",
        categoryId: "school",
        scheduledDate: today,
        status: "todo",
        focusedSeconds: 0,
      },
      {
        id: uid("task"),
        title: "발표 자료 조사",
        note: "국내 사례 3개 · 예시 데이터",
        categoryId: "school",
        scheduledDate: today,
        status: "todo",
        focusedSeconds: 900,
      },
      {
        id: uid("task"),
        title: "포트폴리오 수정",
        note: "프로젝트 설명 추가 · 예시 데이터",
        categoryId: "personal",
        projectId: portfolio,
        scheduledDate: today,
        status: "completed",
        focusedSeconds: 1800,
      },
      {
        id: uid("task"),
        title: "저녁 운동",
        note: "러닝 30분 · 예시 데이터",
        categoryId: "exercise",
        scheduledDate: today,
        status: "todo",
        focusedSeconds: 0,
      },
      {
        id: uid("task"),
        title: "논문 초고 읽기",
        note: "어제 기록 · 예시 데이터",
        categoryId: "school",
        scheduledDate: yesterday,
        status: "completed",
        focusedSeconds: 5400,
      },
      {
        id: uid("task"),
        title: "그룹 과제 초안",
        note: "어제 미완료 · 예시 데이터",
        categoryId: "work",
        scheduledDate: yesterday,
        status: "todo",
        focusedSeconds: 1200,
      },
      {
        id: uid("task"),
        title: "헬스장",
        note: "어제 완료 · 예시 데이터",
        categoryId: "exercise",
        scheduledDate: yesterday,
        status: "completed",
        focusedSeconds: 2400,
      },
    ],
    events: [
      {
        id: uid("event"),
        title: "전공 세미나",
        note: "예시 일정",
        date: today,
        startTime: "14:00",
        endTime: "15:30",
        color: CATEGORY_COLORS.school,
      },
    ],
    courses: [],
    coursePresetColors: defaultCoursePresetColors(),
    customThemePresets: [],
    gradeRecords: [],
    projects: [
      {
        id: portfolio,
        parentId: null,
        name: "졸업 포트폴리오",
        color: CATEGORY_COLORS.personal,
        icon: "F",
        type: "folder",
        blocks: [],
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now(),
      },
      {
        id: research,
        parentId: portfolio,
        name: "사례 조사",
        color: CATEGORY_COLORS.school,
        icon: "R",
        type: "page",
        blocks: [
          { id: uid("block"), type: "heading", text: "사례 조사" },
          { id: uid("block"), type: "paragraph", text: "국내 졸업전시 세 곳을 비교한다." },
          {
            id: uid("block"),
            type: "table",
            headers: ["학교", "형식", "메모"],
            rows: [
              ["홍익", "북렛", "타이포가 강함"],
              ["국민", "웹", "모션 중심"],
            ],
          },
        ],
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now(),
      },
    ],
    groups: [],
    members: [{ id: "member-me", name: "나" }],
    currentMemberId: "member-me",
    profile: { nickname: "", photoUrl: "", bio: "" },
    settings: defaultSettings(),
    posts: [],
    sessions: [
      {
        id: uid("session"),
        taskId: "seed-today",
        taskTitle: "발표 자료 조사",
        categoryId: "school",
        startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 12).getTime(),
        endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 27).getTime(),
        durationSeconds: 900,
        date: today,
      },
      {
        id: uid("session"),
        taskId: "seed-y1",
        taskTitle: "논문 초고 읽기",
        categoryId: "school",
        startTime: yStart,
        endTime: yStart + 5400 * 1000,
        durationSeconds: 5400,
        date: yesterday,
      },
      {
        id: uid("session"),
        taskId: "seed-y2",
        taskTitle: "그룹 과제 초안",
        categoryId: "work",
        startTime: yStart + 6 * 3600 * 1000,
        endTime: yStart + 6 * 3600 * 1000 + 1200 * 1000,
        durationSeconds: 1200,
        date: yesterday,
      },
      {
        id: uid("session"),
        taskId: "seed-y3",
        taskTitle: "헬스장",
        categoryId: "exercise",
        startTime: yStart + 10 * 3600 * 1000,
        endTime: yStart + 10 * 3600 * 1000 + 2400 * 1000,
        durationSeconds: 2400,
        date: yesterday,
      },
    ],
    activeTimer: null,
    auxiliaryTimer: null,
    notifications: [],
    dailyReports: [],
    meta: {
      lastVisitDate: yesterday,
      focusSection: "timer",
      selectedDate: today,
    },
  };
}

function seededState() {
  const base = seed();
  return { ...base, projects: migrateProjects(base.projects) };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seededState();
    const parsed = JSON.parse(raw);
    const base = seed();
    return {
      ...base,
      ...parsed,
      categories: parsed.categories?.length ? parsed.categories : base.categories,
      members: parsed.members?.length ? parsed.members : base.members,
      profile: { nickname: "", photoUrl: "", bio: "", ...base.profile, ...(parsed.profile || {}) },
      settings: mergeSettings(base.settings, parsed.settings),
      courses: migrateCourses(Array.isArray(parsed.courses) ? parsed.courses : base.courses),
      coursePresetColors: normalizeCoursePresetColors(parsed.coursePresetColors ?? base.coursePresetColors),
      customThemePresets: normalizeCustomThemePresets(parsed.customThemePresets ?? base.customThemePresets),
      gradeRecords: Array.isArray(parsed.gradeRecords) ? parsed.gradeRecords : base.gradeRecords,
      projects: migrateProjects(Array.isArray(parsed.projects) ? parsed.projects : base.projects),
      tasks: pruneOrphanTasks(parsed.tasks ?? base.tasks, parsed.groups ?? base.groups),
      meta: { ...base.meta, ...parsed.meta },
    };
  } catch {
    return seededState();
  }
}

let state = load();
const listeners = new Set();
let persistTimer = 0;
let remoteSave = null;

function persistNow() {
  clearTimeout(persistTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
  remoteSave?.(state);
}

persistNow();

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

export function setRemoteSaver(fn) {
  remoteSave = fn;
}

export function replaceState(next) {
  state = {
    ...seed(),
    ...next,
    profile: { nickname: "", photoUrl: "", bio: "", ...state.profile, ...next.profile },
    settings: mergeSettings(state.settings, next.settings),
    meta: { ...state.meta, ...next.meta },
    courses: migrateCourses(next.courses ?? state.courses),
    coursePresetColors: normalizeCoursePresetColors(next.coursePresetColors ?? state.coursePresetColors),
    customThemePresets: normalizeCustomThemePresets(next.customThemePresets ?? state.customThemePresets),
    projects: migrateProjects(next.projects ?? state.projects),
    tasks: pruneOrphanTasks(next.tasks ?? state.tasks, next.groups ?? state.groups),
  };
  emit();
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

export function tasksInGroup(groupId) {
  return state.tasks.filter((task) => task.groupId === groupId);
}

export function projectsInGroup(groupId) {
  return state.projects.filter((page) => page.groupId === groupId && !page.parentId);
}

export function progressOn(dateKey) {
  return dayProgress(tasksOn(dateKey));
}

export function categoryById(id) {
  return state.categories.find((item) => item.id === id);
}

export function projectById(id) {
  return state.projects.find((item) => item.id === id);
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

export function analyzeDay(dateKey) {
  const tasks = tasksOn(dateKey);
  const sessions = state.sessions.filter((session) => session.date === dateKey);
  const progress = dayProgress(tasks);
  const focused = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const leftover = tasks.filter((task) => task.status !== "completed");
  const byCategory = state.categories
    .map((category) => {
      const seconds = sessions
        .filter((session) => session.categoryId === category.id)
        .reduce((sum, session) => sum + session.durationSeconds, 0);
      return { ...category, seconds };
    })
    .filter((item) => item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const longest = [...sessions].sort((a, b) => b.durationSeconds - a.durationSeconds)[0];
  const switches = sessions.length;
  let insight = "기록된 집중 세션이 없습니다. 내일은 한 가지 할 일부터 측정을 켜 보세요.";
  if (focused > 0) {
    if (progress.percent >= 80 && switches <= 3) {
      insight = "할 일 이수율과 세션 집중도가 둘 다 높았습니다. 같은 리듬을 유지하세요.";
    } else if (progress.percent < 50 && focused >= 3600) {
      insight = "시간은 썼지만 완료로 닫히지 않은 일이 많습니다. 내일은 할 일을 더 잘게 쪼개 보세요.";
    } else if (switches >= 6) {
      insight = "세션이 자주 끊겼습니다. 타이머를 켠 뒤 보조 타이머로 한 블록만 지켜 보세요.";
    } else if (leftover.length) {
      insight = `미완료 ${leftover.length}건이 남았습니다. 가장 긴 미완료부터 오전에 배치해 보세요.`;
    } else {
      insight = "계획한 일을 닫고 측정도 남겼습니다. 내일은 난이도 높은 일을 오전에 두세요.";
    }
  }

  return {
    date: dateKey,
    progress,
    focused,
    leftover: leftover.map((task) => task.title),
    byCategory,
    longestTitle: longest?.taskTitle ?? null,
    longestSeconds: longest?.durationSeconds ?? 0,
    switches,
    insight,
  };
}

export function localDailyCopy(report) {
  const pct = report.progress.percent;
  return {
    title: `${report.date} 효율 리포트`,
    headline: `이수율 ${pct}% · 집중 ${Math.round(report.focused / 60)}분`,
    body: report.insight,
    leftover: report.leftover,
    byCategory: report.byCategory,
  };
}

export function ingestDailyReport(dateKey, copy) {
  if (state.dailyReports.some((item) => item.date === dateKey)) return;
  const report = {
    id: uid("report"),
    date: dateKey,
    createdAt: Date.now(),
    ...copy,
  };
  const notification = {
    id: uid("note"),
    type: "daily",
    reportId: report.id,
    title: "AI 코치",
    body: copy.headline,
    createdAt: Date.now(),
    read: false,
  };
  state = {
    ...state,
    dailyReports: [report, ...state.dailyReports],
    notifications: [notification, ...state.notifications],
  };
  emit();
}

export function markVisit(todayKey) {
  const prev = state.meta.lastVisitDate;
  state = { ...state, meta: { ...state.meta, lastVisitDate: todayKey } };
  emit();
  return prev && prev !== todayKey ? prev : null;
}

export function markNotificationsRead() {
  state = {
    ...state,
    notifications: state.notifications.map((item) => ({ ...item, read: true })),
  };
  emit();
}

export function addTask(input) {
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
  };
  if (task.groupId && input.dueDate) task.dueDate = input.dueDate;
  state = { ...state, tasks: [...state.tasks, task] };
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
}

export function updateTask(taskId, changes) {
  state = {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...changes } : task)),
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

export function addCourse(input) {
  const course = {
    id: uid("course"),
    title: String(input.title || "").trim(),
    professor: String(input.professor || "").trim(),
    room: String(input.room || "").trim(),
    color: input.color || CATEGORY_COLORS.school,
    memo: String(input.memo || "").trim(),
    slots: normalizeSlots(input.slots),
  };
  state = { ...state, courses: [...(state.courses || []), course] };
  emit();
  return course;
}

export function updateCourse(id, changes) {
  state = {
    ...state,
    courses: (state.courses || []).map((course) => {
      if (course.id !== id) return course;
      const next = { ...course, ...changes };
      if (changes.title != null) next.title = String(changes.title).trim();
      if (changes.professor != null) next.professor = String(changes.professor).trim();
      if (changes.room != null) next.room = String(changes.room).trim();
      if (changes.memo != null) next.memo = String(changes.memo).trim();
      if (changes.slots != null) next.slots = normalizeSlots(changes.slots);
      return next;
    }),
  };
  emit();
}

export function deleteCourse(id) {
  state = { ...state, courses: (state.courses || []).filter((course) => course.id !== id) };
  emit();
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
    groups: state.groups.map((group) =>
      group.id === groupId
        ? { ...group, memberIds: group.memberIds.filter((id) => id !== state.currentMemberId) }
        : group,
    ),
    tasks: state.tasks.filter((task) => task.groupId !== groupId),
  };
  emit();
}

export function addPost(input) {
  const post = {
    id: uid("post"),
    groupId: input.groupId,
    authorId: state.currentMemberId,
    categoryId: input.categoryId,
    imageUri: input.imageUri,
    caption: input.caption || "",
    createdAt: Date.now(),
    reactions: [],
  };
  state = { ...state, posts: [post, ...state.posts] };
  emit();
}

export function toggleReaction(postId, emoji) {
  const userId = state.currentMemberId;
  state = {
    ...state,
    posts: state.posts.map((post) => {
      if (post.id !== postId) return post;
      const has = post.reactions.some((item) => item.emoji === emoji && item.userId === userId);
      return {
        ...post,
        reactions: has
          ? post.reactions.filter((item) => !(item.emoji === emoji && item.userId === userId))
          : [...post.reactions, { emoji, userId }],
      };
    }),
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
