const identityUrl = "https://esm.sh/@netlify/identity@0.3.0";

let identity = null;
let currentUser = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(currentUser));
}

export function onAuth(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function user() {
  return currentUser;
}

export async function initAuth() {
  try {
    identity = await import(identityUrl);
    await identity.handleAuthCallback?.();
    currentUser = (await identity.getUser()) ?? null;
    identity.onAuthChange?.((next) => {
      currentUser = next ?? null;
      emit();
    });
    emit();
  } catch {
    identity = null;
    currentUser = null;
  }
  return currentUser;
}

export async function signup(email, password, name) {
  if (!identity) throw new Error("계정 기능은 Netlify에 배포된 뒤에 사용할 수 있습니다.");
  currentUser = await identity.signup(email, password, { full_name: name });
  emit();
  return currentUser;
}

export async function login(email, password) {
  if (!identity) throw new Error("계정 기능은 Netlify에 배포된 뒤에 사용할 수 있습니다.");
  currentUser = await identity.login(email, password);
  emit();
  return currentUser;
}

export async function logout() {
  if (identity) await identity.logout();
  currentUser = null;
  emit();
}

export async function authHeader() {
  const token = await identity?.getToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function pullRemote() {
  if (!currentUser) return null;
  const response = await fetch("/api/data", { headers: await authHeader() });
  if (!response.ok) return null;
  return response.json();
}

export async function pushRemote(payload) {
  if (!currentUser) return;
  await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
}

export async function fetchGroupBundle() {
  if (!currentUser) return null;
  const response = await fetch("/api/groups", { headers: await authHeader() });
  if (!response.ok) return null;
  return response.json();
}

async function postGroup(action, payload) {
  if (!currentUser) throw new Error("login-required");
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) throw new Error("groups-unavailable");
  return response.json();
}

export async function syncTimetable(courses) {
  const safe = (Array.isArray(courses) ? courses : []).map((course) => ({
    slots: (Array.isArray(course?.slots) ? course.slots : []).map((slot) => ({
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  }));
  return postGroup("sync-timetable", { courses: safe });
}

export async function createPoll(payload) {
  return postGroup("create-poll", payload);
}

export async function markAvailability(pollId, slots, extra = {}) {
  return postGroup("mark-availability", { pollId, slots, ...extra });
}

export async function findAvailability(members, range = {}) {
  return askCoach({
    action: "availability",
    members,
    targetDates: range.targetDates,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
  });
}

export async function changePassword(newPassword) {
  if (!identity) throw new Error("계정 기능은 Netlify에 배포된 뒤에 사용할 수 있습니다.");
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  if (typeof identity.updateUser !== "function") {
    throw new Error("비밀번호 변경을 지원하지 않는 환경입니다.");
  }
  currentUser = await identity.updateUser({ password: newPassword });
  emit();
  return currentUser;
}

export async function changeEmail(newEmail) {
  if (!identity) throw new Error("계정 기능은 Netlify에 배포된 뒤에 사용할 수 있습니다.");
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  if (typeof identity.updateUser !== "function") {
    throw new Error("이메일 변경을 지원하지 않는 환경입니다.");
  }
  currentUser = await identity.updateUser({ email: newEmail });
  emit();
  return currentUser;
}

export async function saveProfile(nickname) {
  if (!currentUser) return null;
  const response = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) throw new Error("profile-unavailable");
  return response.json();
}

export async function askCoach(body) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("coach-unavailable");
  return response.json();
}
