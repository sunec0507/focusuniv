import {
  getUser,
  handleAuthCallback,
  login as identityLogin,
  logout as identityLogout,
  onAuthChange,
  signup as identitySignup,
  updateUser,
} from "/js/vendor/netlify-identity.js";

let currentUser = null;
let identityReady = false;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(currentUser));
}

function jwtFromCookie() {
  const match = document.cookie.match(/(?:^|; )nf_jwt=([^;]*)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isAuthCallbackHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw || raw.startsWith("/")) return false;
  return /(?:^|&)(access_token|confirmation_token|recovery_token|invite_token|email_change_token)=/.test(raw);
}

export function authErrorMessage(err) {
  const status = err?.status;
  const msg = String(err?.message || err || "");
  if (status === 401 || /invalid.*(email|password)|invalid_grant/i.test(msg)) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (status === 403 || /not allowed|disabled|signups are not allowed/i.test(msg)) {
    return "지금은 회원가입이 허용되지 않습니다.";
  }
  if (status === 422 || /already|registered|exists|taken/i.test(msg)) {
    return "이미 가입된 이메일이거나 비밀번호가 조건에 맞지 않습니다. 비밀번호는 6자 이상으로 입력해 주세요.";
  }
  if (/A user with this email address has already been registered/i.test(msg)) {
    return "이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.";
  }
  if (/Password should be at least/i.test(msg)) {
    return "비밀번호는 6자 이상으로 입력해 주세요.";
  }
  if (/계정 기능은/.test(msg) || /MissingIdentity|not available/i.test(msg)) {
    return "계정 기능을 아직 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
  return msg || "계정 요청을 처리하지 못했습니다.";
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
    if (isAuthCallbackHash(location.hash)) {
      try {
        await handleAuthCallback();
      } catch (err) {
        console.error("[auth] 인증 콜백 처리 실패:", err);
      }
    }
    currentUser = (await getUser()) ?? null;
    onAuthChange((_event, next) => {
      currentUser = next ?? null;
      emit();
    });
    identityReady = true;
    emit();
  } catch (err) {
    console.error("[auth] Netlify Identity 초기화 실패:", err);
    identityReady = false;
    currentUser = null;
  }
  return currentUser;
}

function requireIdentity() {
  if (!identityReady) {
    throw new Error("계정 기능을 아직 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function signup(email, password, name) {
  requireIdentity();
  const emailValue = String(email || "").trim();
  await identitySignup(emailValue, password, {
    full_name: String(name || "").trim(),
  });
  try {
    currentUser = await identityLogin(emailValue, password);
    emit();
    return { user: currentUser, needsConfirmation: false };
  } catch (err) {
    currentUser = null;
    emit();
    if (err?.status === 401 || /not confirmed|email not confirmed/i.test(String(err?.message || ""))) {
      return { user: null, needsConfirmation: true };
    }
    throw err;
  }
}

export async function login(email, password) {
  requireIdentity();
  currentUser = await identityLogin(String(email || "").trim(), password);
  emit();
  return currentUser;
}

export async function logout() {
  currentUser = null;
  emit();
  try {
    await identityLogout();
  } catch (err) {
    console.error("[auth] 로그아웃 실패:", err);
  }
  currentUser = null;
}

export async function authHeader() {
  const token = jwtFromCookie();
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.reason || data?.error || "groups-unavailable");
    err.status = response.status;
    err.reason = data?.reason || data?.error;
    throw err;
  }
  return data;
}

export async function createGroup(name) {
  return postGroup("create", { name });
}

export async function joinGroup(code) {
  try {
    return await postGroup("join", { code });
  } catch (err) {
    if (err?.status === 404) return { ok: false, reason: "missing" };
    if (err?.status === 409) return { ok: false, reason: "full" };
    throw err;
  }
}

export async function leaveGroup(groupId) {
  return postGroup("leave", { groupId });
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

export async function updatePoll(pollId, title) {
  return postGroup("update-poll", { pollId, title });
}

export async function deletePoll(pollId) {
  return postGroup("delete-poll", { pollId });
}

export async function addGroupTask(payload) {
  return postGroup("add-task", payload);
}

export async function updateGroupTask(taskId, changes) {
  return postGroup("update-task", { taskId, ...changes });
}

export async function deleteGroupTask(taskId) {
  return postGroup("delete-task", { taskId });
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
  requireIdentity();
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  currentUser = await updateUser({ password: newPassword });
  emit();
  return currentUser;
}

export async function changeEmail(newEmail) {
  requireIdentity();
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  currentUser = await updateUser({ email: newEmail });
  emit();
  return currentUser;
}

export async function deleteAccount(email) {
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  const response = await fetch("/api/delete-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ email: String(email || "").trim() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "계정을 삭제하지 못했습니다.");
  }
  return data;
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
