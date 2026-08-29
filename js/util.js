export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function formatKoreanDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function formatShortKoreanDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatMonthDay(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function formatRelativeTime(timestamp) {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatKoreanDate(new Date(timestamp));
}

export function clock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatHoursMinutes(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (seconds <= 0) return "기록 없음";
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function splitIntoHourBars(startTime, durationSeconds) {
  const parts = [];
  let cursor = startTime;
  let remaining = durationSeconds;
  while (remaining > 0 && parts.length < 48) {
    const date = new Date(cursor);
    const startSecond = date.getMinutes() * 60 + date.getSeconds();
    const available = 3600 - startSecond;
    const duration = Math.min(remaining, available);
    parts.push({
      hour: date.getHours(),
      startSecond,
      durationSeconds: duration,
    });
    cursor += duration * 1000;
    remaining -= duration;
  }
  return parts;
}

export function makeCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

export function focusElapsed(timer, now = Date.now()) {
  if (!timer) return 0;
  if (!timer.isRunning) return timer.accumulatedSeconds;
  return timer.accumulatedSeconds + Math.max(0, Math.floor((now - timer.startedAt) / 1000));
}

export function auxiliaryRemaining(timer, now = Date.now()) {
  if (!timer) return 0;
  if (!timer.isRunning || !timer.endsAt) return timer.remainingSeconds;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function dayProgress(tasks) {
  if (!tasks.length) return { done: 0, total: 0, percent: 0 };
  const done = tasks.filter((task) => task.status === "completed").length;
  return { done, total: tasks.length, percent: Math.round((done / tasks.length) * 100) };
}
