import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const { useState, useEffect, useMemo, useCallback } = React;
const e = React.createElement;

// lucide-react は使わず、軽量な絵文字/SVGアイコンに差し替え(CDN単体構成のため)
const Icons = {
  Moon: (props) => e("span", { ...iconStyle(props) }, "🌙"),
  Droplets: (props) => e("span", { ...iconStyle(props) }, "💧"),
  Milk: (props) => e("span", { ...iconStyle(props) }, "🍼"),
  Thermometer: (props) => e("span", { ...iconStyle(props) }, "🌡️"),
  Plus: (props) => e("span", { ...iconStyle(props) }, "＋"),
  X: (props) => e("span", { ...iconStyle(props) }, "✕"),
  Baby: (props) => e("span", { ...iconStyle(props) }, "👶"),
  Clock: (props) => e("span", { ...iconStyle(props) }, "🕐"),
  Calendar: (props) => e("span", { ...iconStyle(props) }, "📅"),
  CalendarDays: (props) => e("span", { ...iconStyle(props) }, "🗓️"),
  CalendarRange: (props) => e("span", { ...iconStyle(props) }, "📆"),
  Loader: (props) => e("span", { ...iconStyle(props) }, "…"),
  Pee: (props) => e("span", { ...iconStyle(props) }, "💧"),
  Poop: (props) => e("span", { ...iconStyle(props) }, "💩"),
  Burp: (props) => e("span", { ...iconStyle(props) }, "🌬️"),
  Syringe: (props) => e("span", { ...iconStyle(props) }, "💉"),
  Ruler: (props) => e("span", { ...iconStyle(props) }, "📏"),
};
function iconStyle({ size = 16 }) {
  return { style: { fontSize: size, lineHeight: 1, display: "inline-block" } };
}

// ---------------- Firebase初期化 ----------------
// Firebaseコンソールで取得した設定値。別ファイルに分けるとモジュール読み込み順序の
// トラブルが起きやすいため、ここに直接埋め込んでいる。
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBAYH32iDEZ4B8l0mud6oVR02RrwFKpdpU",
  authDomain: "twin-baby-diary.firebaseapp.com",
  projectId: "twin-baby-diary",
  storageBucket: "twin-baby-diary.firebasestorage.app",
  messagingSenderId: "517552701569",
  appId: "1:517552701569:web:e42d617c7c610c520a0d80",
};
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const ENTRIES_COLLECTION = "twinlog_entries";
const SETTINGS_DOC = doc(db, "twinlog_settings", "twin_names");

// ---------------- 設定 ----------------
const TWINS_DEFAULT = {
  a: { label: "あんず", color: "#E8896B", soft: "#FBE9E3", id: "a" },
  b: { label: "みかん", color: "#5E8B6E", soft: "#E7F0E5", id: "b" },
};

const EVENT_TYPES = {
  feed: { label: "授乳・ミルク", icon: Icons.Milk, unit: "ml" },
  sleep: { label: "寝る/起きる", icon: Icons.Moon, unit: null },
  pee: { label: "おしっこ", icon: Icons.Pee, unit: null },
  poop: { label: "うんち", icon: Icons.Poop, unit: null },
  burp: { label: "ゲップ/吐き戻し", icon: Icons.Burp, unit: null },
  temp: { label: "体温", icon: Icons.Thermometer, unit: "℃" },
  growth: { label: "身長・体重", icon: Icons.Ruler, unit: null },
  vaccine: { label: "予防接種", icon: Icons.Syringe, unit: null },
  // diaper(旧「おむつ」)は新規記録では使わないが、過去データの表示のため定義を残す
  diaper: { label: "おむつ", icon: Icons.Droplets, unit: null },
};

// メインのアクションボタンに出す記録タイプ(diaperは旧データ表示専用のため除外)
const PRIMARY_EVENT_KEYS = ["feed", "sleep", "pee", "poop", "burp", "temp", "growth"];

// ---------------- 予防接種マスターデータ ----------------
// 標準的な接種開始の目安(月齢)。あくまで目安であり、ワクチンの種類や自治体・体調によって
// 実際のスケジュールは異なる。正確な接種計画は必ず医療機関・母子手帳で確認すること。
const VACCINE_LIST = [
  { id: "hepb", name: "B型肝炎", standardMonths: 2, doses: 3, optional: false },
  { id: "rota", name: "ロタウイルス", standardMonths: 2, doses: 2, optional: false, note: "1回目は生後14週6日までが目安" },
  { id: "pcv", name: "小児用肺炎球菌", standardMonths: 2, doses: 4, optional: false },
  { id: "penta", name: "五種混合(DPT-IPV-Hib)", standardMonths: 2, doses: 4, optional: false },
  { id: "bcg", name: "BCG", standardMonths: 5, doses: 1, optional: false },
  { id: "jenc1", name: "日本脳炎(1期)", standardMonths: 36, doses: 3, optional: false },
  { id: "mr1", name: "麻疹・風疹混合(MR)1期", standardMonths: 12, doses: 1, optional: false },
  { id: "varicella", name: "水痘(みずぼうそう)", standardMonths: 12, doses: 2, optional: false },
  { id: "mumps", name: "おたふくかぜ", standardMonths: 12, doses: 2, optional: true },
  { id: "mr2", name: "麻疹・風疹混合(MR)2期", standardMonths: 60, doses: 1, optional: false, note: "年長(5〜6歳)の時期が目安" },
];

// 生年月日と現在日時から、月齢(満月数)を計算する
function monthsBetween(birthDate, targetDate) {
  let months = (targetDate.getFullYear() - birthDate.getFullYear()) * 12;
  months += targetDate.getMonth() - birthDate.getMonth();
  if (targetDate.getDate() < birthDate.getDate()) months -= 1;
  return Math.max(0, months);
}

// 生年月日から、各ワクチンの「標準的な接種開始の目安日」を計算する
function calcVaccineDueDate(birthDate, standardMonths) {
  const d = new Date(birthDate);
  d.setMonth(d.getMonth() + standardMonths);
  return d;
}

// ---------------- 日付ユーティリティ ----------------
function pad(n) { return n.toString().padStart(2, "0"); }
function nowHHMM() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function dayKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDayKey(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function weekdayShort(date) { return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()]; }
function monthKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`; }

function toDateTime(day, time) {
  const d = parseDayKey(day);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

// 「寝た」→「起きた」のイベント配列から、日をまたぐ区間は0時で分割して { day, minutes } の配列を返す。
// 24時間を超える区間は記録漏れ等の異常値とみなし無視する。
function buildSleepSegments(sleepLogs) {
  const sorted = [...sleepLogs].sort(
    (a, b) => toDateTime(a.day, a.time) - toDateTime(b.day, b.time)
  );
  const segments = [];
  let openStart = null;

  for (const ev of sorted) {
    if (ev.detail.state === "寝た") {
      openStart = toDateTime(ev.day, ev.time);
    } else if (ev.detail.state === "起きた" && openStart) {
      const end = toDateTime(ev.day, ev.time);
      const durationMin = (end - openStart) / 60000;
      if (durationMin > 0 && durationMin <= 24 * 60) {
        let cursor = new Date(openStart);
        while (cursor < end) {
          const cursorDay = dayKey(cursor);
          const midnight = new Date(cursor);
          midnight.setHours(24, 0, 0, 0);
          const segEnd = midnight < end ? midnight : end;
          const minutes = (segEnd - cursor) / 60000;
          if (minutes > 0) segments.push({ day: cursorDay, minutes });
          cursor = segEnd;
        }
      }
      openStart = null;
    }
  }
  return segments;
}

function sleepMinutesByDay(sleepLogs) {
  const segments = buildSleepSegments(sleepLogs);
  const map = {};
  for (const seg of segments) map[seg.day] = (map[seg.day] || 0) + seg.minutes;
  return map;
}

// ---------------- メインコンポーネント ----------------
function TwinCareLog() {
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [connError, setConnError] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [view, setView] = useState("day");
  const [dayCursor, setDayCursor] = useState(dayKey());
  const [weekCursor, setWeekCursor] = useState(dayKey());
  const [yearCursor, setYearCursor] = useState(new Date().getFullYear());
  const [settingsDoc, setSettingsDoc] = useState({
    a: TWINS_DEFAULT.a.label,
    b: TWINS_DEFAULT.b.label,
    birthDateA: "",
    birthDateB: "",
  });
  const [showSettings, setShowSettings] = useState(false);

  // 双子の名前は色・IDはそのままに、表示名だけをFirestoreの設定値で上書きする
  const twins = useMemo(
    () => ({
      a: { ...TWINS_DEFAULT.a, label: settingsDoc.a || TWINS_DEFAULT.a.label },
      b: { ...TWINS_DEFAULT.b, label: settingsDoc.b || TWINS_DEFAULT.b.label },
    }),
    [settingsDoc]
  );

  // Firestoreのリアルタイムリスナー(夫婦間で即時同期)
  useEffect(() => {
    const q = query(collection(db, ENTRIES_COLLECTION), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLogs(next);
        setLoaded(true);
        setConnError(false);
      },
      (err) => {
        console.error("Firestore sync error:", err);
        setConnError(true);
        setLoaded(true);
      }
    );
    return () => unsub();
  }, []);

  // 名前・生年月日もFirestoreでリアルタイム同期(夫婦どちらで変更しても即時反映)
  useEffect(() => {
    const unsub = onSnapshot(
      SETTINGS_DOC,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSettingsDoc({
            a: data.a || TWINS_DEFAULT.a.label,
            b: data.b || TWINS_DEFAULT.b.label,
            birthDateA: data.birthDateA || "",
            birthDateB: data.birthDateB || "",
          });
        }
      },
      (err) => console.error("設定の同期エラー:", err)
    );
    return () => unsub();
  }, []);

  async function saveSettings(next) {
    setSettingsDoc(next);
    try {
      await setDoc(SETTINGS_DOC, next);
    } catch (err) {
      console.error("設定の保存に失敗:", err);
      setConnError(true);
    }
  }

  function openSheet(twin, type, recordDay) { setSheet({ twin, type, recordDay: recordDay || dayKey() }); }

  // detailに加えて、記録する日付・時刻も指定できるようにする(過去日への記録に対応)
  async function addLog(detail, recordDay, recordTime) {
    if (!sheet) return;
    const entry = {
      twin: sheet.twin,
      type: sheet.type,
      time: recordTime || nowHHMM(),
      day: recordDay || dayKey(),
      detail,
      createdAt: Date.now(),
    };
    setSheet(null);
    try {
      await addDoc(collection(db, ENTRIES_COLLECTION), entry);
    } catch (err) {
      console.error("保存に失敗:", err);
      setConnError(true);
    }
  }

  async function removeLog(id) {
    try {
      await deleteDoc(doc(db, ENTRIES_COLLECTION, id));
    } catch (err) {
      console.error("削除に失敗:", err);
      setConnError(true);
    }
  }

  if (!loaded) {
    return e("div", { style: styles.loadingPage }, "読み込み中…");
  }

  return e(
    "div",
    { style: styles.page },
    e(Header, { onOpenSettings: () => setShowSettings(true) }),
    e(ViewTabs, { view, setView }),
    connError &&
      e(
        "div",
        { style: styles.errorBanner },
        "サーバーとの通信に失敗しました。ネット接続を確認してください。記録は接続が戻ると同期されます。"
      ),
    view === "day" &&
      e(DayView, { logs, twins, dayCursor, setDayCursor, onAction: openSheet, onRemove: removeLog }),
    view === "week" && e(WeekView, { logs, twins, weekCursor, setWeekCursor }),
    view === "year" && e(YearView, { logs, twins, yearCursor, setYearCursor }),
    view === "vaccine" &&
      e(VaccineView, {
        logs,
        twins,
        settingsDoc,
        onAction: openSheet,
        onRemove: removeLog,
      }),
    sheet &&
      e(EntrySheet, {
        twin: twins[sheet.twin],
        type: sheet.type,
        recordDay: sheet.recordDay,
        onSave: addLog,
        onClose: () => setSheet(null),
      }),
    showSettings &&
      e(SettingsSheet, {
        twins,
        settingsDoc,
        onSave: (next) => {
          saveSettings(next);
          setShowSettings(false);
        },
        onClose: () => setShowSettings(false),
      })
  );
}

// ---------------- ヘッダー & タブ ----------------
function Header({ onOpenSettings }) {
  return e(
    "div",
    { style: styles.header },
    e(
      "div",
      null,
      e("div", { style: styles.headerEyebrow }, "ふたごノート"),
      e("div", { style: styles.headerDate }, "育児記録")
    ),
    e(
      "div",
      { style: styles.headerRight },
      e(
        "button",
        { style: styles.settingsBtn, onClick: onOpenSettings, "aria-label": "設定" },
        e("span", { style: { fontSize: 18 } }, "⚙️")
      ),
      e(Icons.Baby, { size: 26 })
    )
  );
}

function ViewTabs({ view, setView }) {
  const tabs = [
    { key: "day", label: "デイリー", icon: Icons.Calendar },
    { key: "week", label: "ウィークリー", icon: Icons.CalendarDays },
    { key: "year", label: "年次", icon: Icons.CalendarRange },
    { key: "vaccine", label: "予防接種", icon: Icons.Syringe },
  ];
  return e(
    "div",
    { style: styles.tabRow },
    tabs.map((t) => {
      const active = view === t.key;
      return e(
        "button",
        {
          key: t.key,
          onClick: () => setView(t.key),
          style: {
            ...styles.tabBtn,
            background: active ? "#3A3A38" : "transparent",
            color: active ? "#FFFFFF" : "#7A7670",
          },
        },
        e(t.icon, { size: 14 }),
        t.label
      );
    })
  );
}

// ---------------- デイリービュー ----------------
function DayView({ logs, twins, dayCursor, setDayCursor, onAction, onRemove }) {
  const dayLogs = useMemo(
    () => logs.filter((l) => l.day === dayCursor).sort((a, b) => (a.time < b.time ? 1 : -1)),
    [logs, dayCursor]
  );
  const dateObj = parseDayKey(dayCursor);
  const isToday = dayCursor === dayKey();

  return e(
    React.Fragment,
    null,
    e(DayNav, {
      label: `${dateObj.getMonth() + 1}月${dateObj.getDate()}日（${weekdayShort(dateObj)}）${isToday ? "・今日" : ""}`,
      onPrev: () => setDayCursor(dayKey(addDays(dateObj, -1))),
      onNext: () => setDayCursor(dayKey(addDays(dateObj, 1))),
      onToday: () => setDayCursor(dayKey()),
      disableNext: isToday,
    }),
    e(
      "div",
      { style: styles.twinGrid },
      Object.values(twins).map((twin) =>
        e(TwinColumn, {
          key: twin.id,
          twin,
          logs: dayLogs.filter((l) => l.twin === twin.id),
          onAction: (type) => onAction(twin.id, type, dayCursor),
        })
      )
    ),
    e(Timeline, { logs: dayLogs, twins, onRemove })
  );
}

function DayNav({ label, onPrev, onNext, onToday, disableNext }) {
  return e(
    "div",
    { style: styles.dayNav },
    e("button", { style: styles.navArrow, onClick: onPrev }, "‹"),
    e("button", { style: styles.navLabel, onClick: onToday }, label),
    e(
      "button",
      {
        style: { ...styles.navArrow, opacity: disableNext ? 0.3 : 1 },
        onClick: disableNext ? undefined : onNext,
        disabled: disableNext,
      },
      "›"
    )
  );
}

function TwinColumn({ twin, logs, onAction }) {
  const lastFeed = logs.find((l) => l.type === "feed");
  const lastSleep = logs.find((l) => l.type === "sleep");
  const isSleeping = lastSleep && lastSleep.detail.state === "寝た";

  return e(
    "div",
    { style: { ...styles.column, borderColor: twin.color } },
    e(
      "div",
      { style: { ...styles.columnHeader, background: twin.soft } },
      e("span", { style: { ...styles.columnDot, background: twin.color } }),
      e("span", { style: { ...styles.columnName, color: twin.color } }, twin.label),
      isSleeping && e("span", { style: styles.sleepingTag }, "ねんね中")
    ),
    e(
      "div",
      { style: styles.statRow },
      e(Stat, { label: "前回の授乳", value: lastFeed ? lastFeed.time : "記録なし" }),
      e(Stat, {
        label: "状態",
        value: isSleeping ? "睡眠中" : lastSleep ? `起床 ${lastSleep.time}` : "—",
      })
    ),
    e(
      "div",
      { style: styles.actionGrid },
      PRIMARY_EVENT_KEYS.map((key) => {
        const cfg = EVENT_TYPES[key];
        return e(
          "button",
          {
            key,
            style: { ...styles.actionBtn, borderColor: twin.color },
            onClick: () => onAction(key),
          },
          e(cfg.icon, { size: 18 }),
          e("span", { style: { ...styles.actionLabel, color: twin.color } }, cfg.label)
        );
      })
    )
  );
}

function Stat({ label, value }) {
  return e(
    "div",
    { style: styles.statBox },
    e("div", { style: styles.statLabel }, label),
    e("div", { style: styles.statValue }, value)
  );
}

function Timeline({ logs, twins, onRemove }) {
  return e(
    "div",
    { style: styles.timelineWrap },
    e(
      "div",
      { style: styles.timelineTitle },
      e(Icons.Clock, { size: 14 }),
      e("span", null, "記録一覧")
    ),
    logs.length === 0
      ? e("div", { style: styles.emptyState }, "この日の記録はまだありません。")
      : e(
          "div",
          { style: styles.timelineList },
          logs.map((log) => e(TimelineRow, { key: log.id, log, twins, onRemove }))
        )
  );
}

function TimelineRow({ log, twins, onRemove }) {
  const twin = twins[log.twin];
  const cfg = EVENT_TYPES[log.type];

  function describe() {
    const d = log.detail;
    if (log.type === "feed") return `${d.amount ? d.amount + "ml" : ""} ${d.method || ""}`.trim();
    if (log.type === "sleep") return d.state;
    if (log.type === "diaper") return d.kind;
    if (log.type === "burp") return d.kind || "";
    if (log.type === "temp") return `${d.value}℃`;
    if (log.type === "growth") {
      const parts = [];
      if (d.height) parts.push(`${d.height}cm`);
      if (d.weight) parts.push(`${d.weight}kg`);
      return parts.join(" / ");
    }
    if (log.type === "vaccine") return d.vaccineName || "";
    return "";
  }

  return e(
    "div",
    { style: styles.row },
    e("div", { style: styles.rowTime }, log.time),
    e("div", { style: { ...styles.rowDot, background: twin.color } }),
    e(cfg.icon, { size: 16 }),
    e(
      "div",
      { style: styles.rowText },
      e("span", { style: { color: twin.color, fontWeight: 600 } }, twin.label),
      e("span", { style: styles.rowSep }, "・"),
      e("span", null, cfg.label),
      describe() && e("span", { style: styles.rowDetail }, "\u3000" + describe())
    ),
    onRemove &&
      e(
        "button",
        { style: styles.rowDelete, onClick: () => onRemove(log.id), "aria-label": "削除" },
        e(Icons.X, { size: 14 })
      )
  );
}

// ---------------- ウィークリービュー ----------------
function getWeekStart(dateKeyStr) {
  const d = parseDayKey(dateKeyStr);
  const offset = d.getDay();
  return addDays(d, -offset);
}

function WeekView({ logs, twins, weekCursor, setWeekCursor }) {
  const weekStart = getWeekStart(weekCursor);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i))),
    [weekStart]
  );
  const isCurrentWeek = weekDays.includes(dayKey());
  const weekEnd = addDays(weekStart, 6);
  const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()} 〜 ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  return e(
    React.Fragment,
    null,
    e(DayNav, {
      label: `${label}${isCurrentWeek ? "・今週" : ""}`,
      onPrev: () => setWeekCursor(dayKey(addDays(weekStart, -7))),
      onNext: () => setWeekCursor(dayKey(addDays(weekStart, 7))),
      onToday: () => setWeekCursor(dayKey()),
      disableNext: isCurrentWeek,
    }),
    e(
      "div",
      { style: styles.twinGridStack },
      Object.values(twins).map((twin) =>
        e(WeekTwinBlock, {
          key: twin.id,
          twin,
          weekDays,
          allTwinLogs: logs.filter((l) => l.twin === twin.id),
          weekLogs: logs.filter((l) => l.twin === twin.id && weekDays.includes(l.day)),
        })
      )
    )
  );
}

function WeekTwinBlock({ twin, weekDays, allTwinLogs, weekLogs }) {
  const byDay = useMemo(() => {
    const map = {};
    for (const day of weekDays) map[day] = { feedCount: 0, feedMl: 0, diaperCount: 0, sleepMinutes: 0 };

    const sleepLogs = allTwinLogs.filter((l) => l.type === "sleep");
    const sleepMap = sleepMinutesByDay(sleepLogs);
    for (const day of weekDays) if (sleepMap[day]) map[day].sleepMinutes = sleepMap[day];

    for (const l of weekLogs) {
      if (!map[l.day]) continue;
      if (l.type === "feed") {
        map[l.day].feedCount += 1;
        map[l.day].feedMl += Number(l.detail.amount) || 0;
      } else if (l.type === "diaper") {
        map[l.day].diaperCount += 1;
      }
    }
    return map;
  }, [allTwinLogs, weekLogs, weekDays]);

  const maxFeedMl = Math.max(1, ...weekDays.map((d) => byDay[d].feedMl));
  const maxSleepMin = Math.max(1, ...weekDays.map((d) => byDay[d].sleepMinutes));

  const totals = weekDays.reduce(
    (acc, d) => {
      acc.feedCount += byDay[d].feedCount;
      acc.feedMl += byDay[d].feedMl;
      acc.diaperCount += byDay[d].diaperCount;
      acc.sleepMinutes += byDay[d].sleepMinutes;
      return acc;
    },
    { feedCount: 0, feedMl: 0, diaperCount: 0, sleepMinutes: 0 }
  );

  return e(
    "div",
    { style: { ...styles.weekBlock, borderColor: twin.color } },
    e(
      "div",
      { style: { ...styles.columnHeader, background: twin.soft } },
      e("span", { style: { ...styles.columnDot, background: twin.color } }),
      e("span", { style: { ...styles.columnName, color: twin.color } }, twin.label)
    ),
    e(
      "div",
      { style: styles.weekSummaryRow },
      e(SummaryChip, { label: "授乳回数/日", value: (totals.feedCount / 7).toFixed(1) }),
      e(SummaryChip, { label: "授乳量/日", value: `${Math.round(totals.feedMl / 7)}ml` }),
      e(SummaryChip, { label: "おむつ/日", value: (totals.diaperCount / 7).toFixed(1) }),
      e(SummaryChip, {
        label: "睡眠/日",
        value:
          totals.sleepMinutes > 0
            ? `${Math.floor(totals.sleepMinutes / 7 / 60)}h${Math.round((totals.sleepMinutes / 7) % 60)}m`
            : "—",
      })
    ),
    e("div", { style: styles.chartLabel }, "授乳量(ml)"),
    e(BarRow, {
      days: weekDays,
      getValue: (d) => byDay[d].feedMl,
      max: maxFeedMl,
      color: twin.color,
      formatTop: (v) => (v > 0 ? `${v}` : ""),
    }),
    e("div", { style: styles.chartLabel }, "睡眠時間"),
    e(BarRow, {
      days: weekDays,
      getValue: (d) => byDay[d].sleepMinutes,
      max: maxSleepMin,
      color: twin.color,
      formatTop: (v) => (v > 0 ? `${Math.floor(v / 60)}h${pad(Math.round(v % 60))}` : ""),
      opacity: 0.55,
    })
  );
}

function BarRow({ days, getValue, max, color, formatTop, opacity = 1 }) {
  return e(
    "div",
    { style: styles.barRow },
    days.map((d) => {
      const v = getValue(d);
      const h = Math.max(3, Math.round((v / max) * 64));
      const dateObj = parseDayKey(d);
      const isToday = d === dayKey();
      return e(
        "div",
        { key: d, style: styles.barCol },
        e("div", { style: styles.barTopLabel }, formatTop(v)),
        e(
          "div",
          { style: styles.barTrack },
          e("div", { style: { ...styles.barFill, height: h, background: color, opacity } })
        ),
        e("div", { style: { ...styles.barDayLabel, fontWeight: isToday ? 800 : 500 } }, weekdayShort(dateObj))
      );
    })
  );
}

function SummaryChip({ label, value }) {
  return e(
    "div",
    { style: styles.summaryChip },
    e("div", { style: styles.summaryChipLabel }, label),
    e("div", { style: styles.summaryChipValue }, value)
  );
}

// ---------------- 年次ビュー ----------------
function YearView({ logs, twins, yearCursor, setYearCursor }) {
  const isCurrentYear = yearCursor === new Date().getFullYear();
  return e(
    React.Fragment,
    null,
    e(DayNav, {
      label: `${yearCursor}年${isCurrentYear ? "・今年" : ""}`,
      onPrev: () => setYearCursor(yearCursor - 1),
      onNext: () => setYearCursor(yearCursor + 1),
      onToday: () => setYearCursor(new Date().getFullYear()),
      disableNext: isCurrentYear,
    }),
    e(
      "div",
      { style: styles.twinGridStack },
      Object.values(twins).map((twin) =>
        e(YearTwinBlock, {
          key: twin.id,
          twin,
          year: yearCursor,
          allTwinLogs: logs.filter((l) => l.twin === twin.id),
          yearLogs: logs.filter((l) => l.twin === twin.id && parseDayKey(l.day).getFullYear() === yearCursor),
        })
      )
    )
  );
}

function YearTwinBlock({ twin, year, allTwinLogs, yearLogs }) {
  const months = Array.from({ length: 12 }, (_, i) => i);

  const byMonth = useMemo(() => {
    const map = {};
    for (const m of months) map[m] = { feedCount: 0, feedMl: 0, diaperCount: 0, days: new Set(), sleepMinutes: 0 };

    const sleepLogs = allTwinLogs.filter((l) => l.type === "sleep");
    const segments = buildSleepSegments(sleepLogs);
    for (const seg of segments) {
      const segDate = parseDayKey(seg.day);
      if (segDate.getFullYear() === year) {
        map[segDate.getMonth()].sleepMinutes += seg.minutes;
        map[segDate.getMonth()].days.add(seg.day);
      }
    }

    for (const l of yearLogs) {
      const m = parseDayKey(l.day).getMonth();
      map[m].days.add(l.day);
      if (l.type === "feed") {
        map[m].feedCount += 1;
        map[m].feedMl += Number(l.detail.amount) || 0;
      } else if (l.type === "diaper") {
        map[m].diaperCount += 1;
      }
    }
    return map;
  }, [allTwinLogs, yearLogs, year, months]);

  const maxFeedCount = Math.max(1, ...months.map((m) => byMonth[m].feedCount));
  const maxAvgSleepMin = Math.max(
    1,
    ...months.map((m) => (byMonth[m].days.size > 0 ? byMonth[m].sleepMinutes / byMonth[m].days.size : 0))
  );

  const totalDaysLogged = months.reduce((s, m) => s + byMonth[m].days.size, 0);
  const totalFeed = months.reduce((s, m) => s + byMonth[m].feedCount, 0);
  const totalDiaper = months.reduce((s, m) => s + byMonth[m].diaperCount, 0);

  return e(
    "div",
    { style: { ...styles.weekBlock, borderColor: twin.color } },
    e(
      "div",
      { style: { ...styles.columnHeader, background: twin.soft } },
      e("span", { style: { ...styles.columnDot, background: twin.color } }),
      e("span", { style: { ...styles.columnName, color: twin.color } }, twin.label)
    ),
    e(
      "div",
      { style: styles.weekSummaryRow },
      e(SummaryChip, { label: "記録した日数", value: `${totalDaysLogged}日` }),
      e(SummaryChip, {
        label: "授乳回数/日",
        value: totalDaysLogged > 0 ? (totalFeed / totalDaysLogged).toFixed(1) : "—",
      }),
      e(SummaryChip, {
        label: "おむつ/日",
        value: totalDaysLogged > 0 ? (totalDiaper / totalDaysLogged).toFixed(1) : "—",
      })
    ),
    e("div", { style: styles.chartLabel }, "月別 授乳回数"),
    e(MonthBarRow, { months, getValue: (m) => byMonth[m].feedCount, max: maxFeedCount, color: twin.color, year }),
    e("div", { style: styles.chartLabel }, "月別 平均睡眠時間/日"),
    e(MonthBarRow, {
      months,
      getValue: (m) => (byMonth[m].days.size > 0 ? byMonth[m].sleepMinutes / byMonth[m].days.size : 0),
      max: maxAvgSleepMin,
      color: twin.color,
      year,
      opacity: 0.55,
    }),
    totalDaysLogged === 0 && e("div", { style: styles.emptyState }, "この年の記録はまだありません。")
  );
}

function MonthBarRow({ months, getValue, max, color, year, opacity = 1 }) {
  return e(
    "div",
    { style: styles.monthBarRow },
    months.map((m) => {
      const v = getValue(m);
      const h = Math.max(3, Math.round((v / max) * 56));
      const isCurrentMonth = monthKey(new Date()) === `${year}-${pad(m + 1)}`;
      return e(
        "div",
        { key: m, style: styles.monthCol },
        e(
          "div",
          { style: styles.barTrack },
          e("div", {
            style: { ...styles.barFill, height: h, background: color, opacity: v > 0 ? opacity : 0.15 },
          })
        ),
        e("div", { style: { ...styles.monthLabel, fontWeight: isCurrentMonth ? 800 : 500 } }, m + 1)
      );
    })
  );
}

// ---------------- 予防接種ビュー ----------------
function VaccineView({ logs, twins, settingsDoc, onAction, onRemove }) {
  const hasBirthA = !!settingsDoc.birthDateA;
  const hasBirthB = !!settingsDoc.birthDateB;

  return e(
    React.Fragment,
    null,
    e(
      "div",
      { style: styles.vaccineIntro },
      "ここに表示される接種目安日は標準的なスケジュールに基づく目安です。実際の接種は必ず医療機関・母子手帳でご確認ください。"
    ),
    e(
      "div",
      { style: styles.twinGridStack },
      Object.values(twins).map((twin) =>
        e(VaccineTwinBlock, {
          key: twin.id,
          twin,
          birthDate: twin.id === "a" ? settingsDoc.birthDateA : settingsDoc.birthDateB,
          logs: logs.filter((l) => l.twin === twin.id && l.type === "vaccine"),
          onAction: () => onAction(twin.id, "vaccine", dayKey()),
          onRemove,
        })
      )
    )
  );
}

function VaccineTwinBlock({ twin, birthDate, logs, onAction, onRemove }) {
  const takenIds = useMemo(() => new Set(logs.map((l) => l.detail.vaccineId)), [logs]);
  const today = new Date();
  const birth = birthDate ? parseDayKeyFlexible(birthDate) : null;
  const currentMonths = birth ? monthsBetween(birth, today) : null;

  return e(
    "div",
    { style: { ...styles.weekBlock, borderColor: twin.color } },
    e(
      "div",
      { style: { ...styles.columnHeader, background: twin.soft } },
      e("span", { style: { ...styles.columnDot, background: twin.color } }),
      e("span", { style: { ...styles.columnName, color: twin.color } }, twin.label),
      currentMonths !== null &&
        e("span", { style: styles.vaccineAgeTag }, `生後${currentMonths}か月`),
      e(
        "button",
        {
          style: { ...styles.vaccineAddBtn, borderColor: twin.color, color: twin.color },
          onClick: onAction,
        },
        "＋ 記録する"
      )
    ),
    !birth &&
      e(
        "div",
        { style: styles.emptyState },
        "生年月日が未設定です。設定(⚙️)から生年月日を入力すると、接種目安日が表示されます。"
      ),
    e(
      "div",
      { style: styles.vaccineList },
      VACCINE_LIST.map((v) => {
        const taken = takenIds.has(v.id);
        const takenLog = logs.find((l) => l.detail.vaccineId === v.id);
        let dueLabel = "";
        let isOverdue = false;
        if (birth && !taken) {
          const due = calcVaccineDueDate(birth, v.standardMonths);
          dueLabel = `目安: ${due.getFullYear()}/${due.getMonth() + 1}/${due.getDate()}`;
          isOverdue = due < today;
        }
        return e(
          "div",
          { key: v.id, style: styles.vaccineRow },
          e(
            "div",
            { style: styles.vaccineRowMain },
            e(
              "div",
              { style: styles.vaccineName },
              v.name,
              v.optional && e("span", { style: styles.vaccineOptionalTag }, "任意")
            ),
            v.note && e("div", { style: styles.vaccineNote }, v.note),
            !taken &&
              birth &&
              e(
                "div",
                { style: { ...styles.vaccineDue, color: isOverdue ? "#A8503A" : "#9A9690" } },
                dueLabel
              ),
            taken &&
              e(
                "div",
                { style: styles.vaccineTakenDate },
                `接種済み: ${takenLog.day}`
              )
          ),
          taken
            ? e(
                "button",
                {
                  style: styles.vaccineUndoBtn,
                  onClick: () => onRemove(takenLog.id),
                  "aria-label": "取り消す",
                },
                e(Icons.X, { size: 14 })
              )
            : e(
                "div",
                { style: { ...styles.vaccineStatusDot, background: isOverdue ? "#E8896B" : "#D8D3C8" } }
              )
        );
      })
    )
  );
}

// "YYYY-MM-DD" 形式の日付文字列をDateに変換(parseDayKeyと同じだが命名を分けて意図を明確化)
function parseDayKeyFlexible(key) {
  return parseDayKey(key);
}

function EntrySheet({ twin, type, recordDay, onSave, onClose }) {
  const cfg = EVENT_TYPES[type];
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("ミルク");
  const [sleepState, setSleepState] = useState("寝た");
  const [burpKind, setBurpKind] = useState("ゲップ");
  const [temp, setTemp] = useState("36.5");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [vaccineId, setVaccineId] = useState(VACCINE_LIST[0].id);

  // 記録する日付・時刻。デフォルトは「今見ている日付」+「現在時刻」。
  // 過去に遡って記録したい場合は、ここで自由に変更できる。
  const [entryDay, setEntryDay] = useState(recordDay || dayKey());
  const [entryTime, setEntryTime] = useState(nowHHMM());

  function handleSave() {
    let detail = {};
    if (type === "feed") detail = { amount, method };
    else if (type === "sleep") detail = { state: sleepState };
    else if (type === "pee") detail = {};
    else if (type === "poop") detail = {};
    else if (type === "burp") detail = { kind: burpKind };
    else if (type === "temp") detail = { value: temp };
    else if (type === "growth") detail = { height, weight };
    else if (type === "vaccine") {
      const v = VACCINE_LIST.find((item) => item.id === vaccineId);
      detail = { vaccineId, vaccineName: v ? v.name : vaccineId };
    }
    onSave(detail, entryDay, entryTime);
  }

  return e(
    "div",
    { style: styles.overlay, onClick: onClose },
    e(
      "div",
      { style: styles.sheet, onClick: (ev) => ev.stopPropagation() },
      e(
        "div",
        { style: styles.sheetHeader },
        e(
          "div",
          null,
          e("span", { style: { ...styles.sheetTwinTag, background: twin.soft, color: twin.color } }, twin.label),
          e("div", { style: styles.sheetTitle }, `${cfg.label}を記録`)
        ),
        e(
          "button",
          { style: styles.sheetClose, onClick: onClose, "aria-label": "閉じる" },
          e(Icons.X, { size: 20 })
        )
      ),
      e(
        "div",
        { style: styles.sheetBody },
        type === "feed" &&
          e(
            React.Fragment,
            null,
            e(FieldLabel, null, "あげ方"),
            e(SegButtons, { options: ["ミルク", "母乳", "両方"], value: method, onChange: setMethod, accent: twin.color }),
            e(FieldLabel, null, "量（ml・任意）"),
            e("input", {
              style: styles.input,
              type: "number",
              inputMode: "numeric",
              placeholder: "例: 120",
              value: amount,
              onChange: (ev) => setAmount(ev.target.value),
            })
          ),
        type === "sleep" &&
          e(
            React.Fragment,
            null,
            e(FieldLabel, null, "状態"),
            e(SegButtons, { options: ["寝た", "起きた"], value: sleepState, onChange: setSleepState, accent: twin.color })
          ),
        (type === "pee" || type === "poop") &&
          e(
            "div",
            { style: styles.sheetTimeNote },
            `「${cfg.label}」として記録します。`
          ),
        type === "burp" &&
          e(
            React.Fragment,
            null,
            e(FieldLabel, null, "種類"),
            e(SegButtons, {
              options: ["ゲップ", "吐き戻し"],
              value: burpKind,
              onChange: setBurpKind,
              accent: twin.color,
            })
          ),
        type === "temp" &&
          e(
            React.Fragment,
            null,
            e(FieldLabel, null, "体温（℃）"),
            e("input", {
              style: styles.input,
              type: "number",
              inputMode: "decimal",
              step: "0.1",
              value: temp,
              onChange: (ev) => setTemp(ev.target.value),
            })
          ),
        type === "growth" &&
          e(
            React.Fragment,
            null,
            e(FieldLabel, null, "身長（cm・任意）"),
            e("input", {
              style: styles.input,
              type: "number",
              inputMode: "decimal",
              step: "0.1",
              placeholder: "例: 58.5",
              value: height,
              onChange: (ev) => setHeight(ev.target.value),
            }),
            e(FieldLabel, null, "体重（kg・任意）"),
            e("input", {
              style: styles.input,
              type: "number",
              inputMode: "decimal",
              step: "0.01",
              placeholder: "例: 5.20",
              value: weight,
              onChange: (ev) => setWeight(ev.target.value),
            })
          ),
        type === "vaccine" &&
          e(
            React.Fragment,
            null,
            e(FieldLabel, null, "ワクチンの種類"),
            e(
              "select",
              {
                style: styles.input,
                value: vaccineId,
                onChange: (ev) => setVaccineId(ev.target.value),
              },
              VACCINE_LIST.map((v) =>
                e("option", { key: v.id, value: v.id }, v.name + (v.optional ? "(任意)" : ""))
              )
            )
          ),
        e(FieldLabel, null, "記録する日付・時刻"),
        e(
          "div",
          { style: styles.dateTimeRow },
          e("input", {
            style: { ...styles.input, flex: 1.3 },
            type: "date",
            value: entryDay,
            max: dayKey(),
            onChange: (ev) => setEntryDay(ev.target.value),
          }),
          e("input", {
            style: { ...styles.input, flex: 1 },
            type: "time",
            value: entryTime,
            onChange: (ev) => setEntryTime(ev.target.value),
          })
        ),
        e(
          "div",
          { style: styles.sheetTimeNote },
          "つけ忘れた記録は、日付・時刻を過去に変更してから保存できます。"
        )
      ),
      e(
        "button",
        { style: { ...styles.saveBtn, background: twin.color }, onClick: handleSave },
        e(Icons.Plus, { size: 18 }),
        "記録する"
      )
    )
  );
}

function FieldLabel({ children }) {
  return e("div", { style: styles.fieldLabel }, children);
}

// ---------------- 設定シート(双子の名前変更) ----------------
function SettingsSheet({ twins, settingsDoc, onSave, onClose }) {
  const [nameA, setNameA] = useState(twins.a.label);
  const [nameB, setNameB] = useState(twins.b.label);
  const [birthDateA, setBirthDateA] = useState(settingsDoc.birthDateA || "");
  const [birthDateB, setBirthDateB] = useState(settingsDoc.birthDateB || "");

  function handleSave() {
    const trimmedA = nameA.trim();
    const trimmedB = nameB.trim();
    onSave({
      a: trimmedA || twins.a.label,
      b: trimmedB || twins.b.label,
      birthDateA,
      birthDateB,
    });
  }

  return e(
    "div",
    { style: styles.overlay, onClick: onClose },
    e(
      "div",
      { style: styles.sheet, onClick: (ev) => ev.stopPropagation() },
      e(
        "div",
        { style: styles.sheetHeader },
        e("div", { style: styles.sheetTitle }, "名前・生年月日の設定"),
        e(
          "button",
          { style: styles.sheetClose, onClick: onClose, "aria-label": "閉じる" },
          e(Icons.X, { size: 20 })
        )
      ),
      e(
        "div",
        { style: styles.sheetBody },
        e(
          "div",
          { style: { ...styles.sheetTwinTag, background: twins.a.soft, color: twins.a.color } },
          "1人目"
        ),
        e("input", {
          style: styles.input,
          type: "text",
          value: nameA,
          maxLength: 10,
          placeholder: "例: あんず",
          onChange: (ev) => setNameA(ev.target.value),
        }),
        e(FieldLabel, null, "生年月日(予防接種の目安計算に使用)"),
        e("input", {
          style: styles.input,
          type: "date",
          value: birthDateA,
          max: dayKey(),
          onChange: (ev) => setBirthDateA(ev.target.value),
        }),
        e(
          "div",
          {
            style: {
              ...styles.sheetTwinTag,
              background: twins.b.soft,
              color: twins.b.color,
              marginTop: 18,
            },
          },
          "2人目"
        ),
        e("input", {
          style: styles.input,
          type: "text",
          value: nameB,
          maxLength: 10,
          placeholder: "例: みかん",
          onChange: (ev) => setNameB(ev.target.value),
        }),
        e(FieldLabel, null, "生年月日(予防接種の目安計算に使用)"),
        e("input", {
          style: styles.input,
          type: "date",
          value: birthDateB,
          max: dayKey(),
          onChange: (ev) => setBirthDateB(ev.target.value),
        }),
        e(
          "div",
          { style: styles.sheetTimeNote },
          "名前・生年月日はFirestoreに保存され、夫婦どちらの端末でも同じ内容が表示されます。"
        )
      ),
      e(
        "button",
        { style: { ...styles.saveBtn, background: "#3A3A38" }, onClick: handleSave },
        "保存する"
      )
    )
  );
}

function SegButtons({ options, value, onChange, accent }) {
  return e(
    "div",
    { style: styles.segRow },
    options.map((opt) => {
      const active = opt === value;
      return e(
        "button",
        {
          key: opt,
          onClick: () => onChange(opt),
          style: {
            ...styles.segBtn,
            borderColor: accent,
            background: active ? accent : "transparent",
            color: active ? "#FFF" : accent,
          },
        },
        opt
      );
    })
  );
}

// ---------------- スタイル ----------------
const styles = {
  page: { fontFamily: "'Hiragino Sans','Yu Gothic',-apple-system,BlinkMacSystemFont,sans-serif", background: "#FAF7F2", minHeight: "100vh", padding: "16px 14px 40px", color: "#3A3A38", maxWidth: 480, margin: "0 auto", boxSizing: "border-box" },
  loadingPage: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#9A9690", fontSize: 14, fontFamily: "'Hiragino Sans',sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "4px 4px 14px", borderBottom: "1px solid #E7E2D8" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  settingsBtn: { border: "none", background: "#F2EEE5", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  headerEyebrow: { fontSize: 11, letterSpacing: "0.12em", color: "#9A9690", marginBottom: 2 },
  headerDate: { fontSize: 19, fontWeight: 700, letterSpacing: "0.01em" },
  tabRow: { display: "flex", gap: 4, marginBottom: 16, background: "#EFEAE0", borderRadius: 12, padding: 4, overflowX: "auto" },
  tabBtn: { flex: 1, border: "none", borderRadius: 9, padding: "8px 2px", fontSize: 10.5, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer", whiteSpace: "nowrap" },
  errorBanner: { background: "#FBEAE3", color: "#A8503A", fontSize: 12, padding: "8px 12px", borderRadius: 10, marginBottom: 14 },
  dayNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 14 },
  navArrow: { border: "none", background: "none", fontSize: 22, color: "#9A9690", cursor: "pointer", padding: "0 8px", lineHeight: 1 },
  navLabel: { border: "none", background: "none", fontSize: 15, fontWeight: 700, color: "#3A3A38", cursor: "pointer" },
  twinGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 },
  twinGridStack: { display: "flex", flexDirection: "column", gap: 14 },
  column: { border: "1.5px solid", borderRadius: 16, overflow: "hidden", background: "#FFFFFF", display: "flex", flexDirection: "column" },
  weekBlock: { border: "1.5px solid", borderRadius: 16, overflow: "hidden", background: "#FFFFFF", paddingBottom: 14 },
  columnHeader: { display: "flex", alignItems: "center", gap: 7, padding: "10px 12px" },
  columnDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  columnName: { fontSize: 15, fontWeight: 700 },
  sleepingTag: { marginLeft: "auto", fontSize: 10, color: "#7A7670", background: "#FFFFFFAA", padding: "2px 7px", borderRadius: 999 },
  statRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "10px 10px 4px" },
  statBox: { background: "#F7F4EE", borderRadius: 10, padding: "7px 8px" },
  statLabel: { fontSize: 10, color: "#9A9690", marginBottom: 2 },
  statValue: { fontSize: 13, fontWeight: 700 },
  actionGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 10 },
  actionBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, border: "1.3px solid", borderRadius: 12, background: "#FFFFFF", padding: "10px 4px", cursor: "pointer" },
  actionLabel: { fontSize: 10.5, fontWeight: 600, lineHeight: 1.2, textAlign: "center" },
  pastNotice: { fontSize: 11, color: "#B5B0A4", padding: "14px 12px", textAlign: "center", lineHeight: 1.6 },
  vaccineIntro: { fontSize: 11.5, color: "#7A7670", background: "#F2EEE5", borderRadius: 10, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 },
  vaccineAddBtn: { marginLeft: "auto", border: "1.3px solid", borderRadius: 999, background: "#FFFFFF", padding: "5px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
  vaccineAgeTag: { fontSize: 10.5, color: "#7A7670", background: "#FFFFFFAA", padding: "2px 8px", borderRadius: 999, marginLeft: 6 },
  vaccineList: { display: "flex", flexDirection: "column" },
  vaccineRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderBottom: "1px solid #F2EEE5" },
  vaccineRowMain: { flex: 1, minWidth: 0 },
  vaccineName: { fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 },
  vaccineOptionalTag: { fontSize: 9.5, color: "#9A9690", fontWeight: 500, background: "#F2EEE5", padding: "1px 6px", borderRadius: 999 },
  vaccineNote: { fontSize: 10.5, color: "#9A9690", marginTop: 2, lineHeight: 1.5 },
  vaccineDue: { fontSize: 11, marginTop: 4, fontWeight: 600 },
  vaccineTakenDate: { fontSize: 11, color: "#5E8B6E", marginTop: 4, fontWeight: 600 },
  vaccineStatusDot: { width: 10, height: 10, borderRadius: "50%", marginTop: 4, flexShrink: 0 },
  vaccineUndoBtn: { border: "none", background: "#F2EEE5", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A7670", flexShrink: 0, marginTop: 2 },
  timelineWrap: { background: "#FFFFFF", borderRadius: 16, border: "1px solid #ECE7DD", padding: 14 },
  timelineTitle: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#7A7670", marginBottom: 10, letterSpacing: "0.04em" },
  emptyState: { fontSize: 13, color: "#9A9690", lineHeight: 1.7, padding: "12px 4px" },
  timelineList: { display: "flex", flexDirection: "column" },
  row: { display: "flex", alignItems: "center", gap: 8, padding: "9px 2px", borderBottom: "1px solid #F2EEE5" },
  rowTime: { fontSize: 12, color: "#9A9690", width: 38, flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  rowDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  rowText: { fontSize: 13, flex: 1, minWidth: 0 },
  rowSep: { color: "#C9C4B8", margin: "0 2px" },
  rowDetail: { color: "#7A7670" },
  rowDelete: { border: "none", background: "none", color: "#C9C4B8", cursor: "pointer", padding: 4, flexShrink: 0 },
  weekSummaryRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, padding: "10px 12px 2px" },
  summaryChip: { background: "#F7F4EE", borderRadius: 10, padding: "7px 5px", textAlign: "center" },
  summaryChipLabel: { fontSize: 9, color: "#9A9690", marginBottom: 2, lineHeight: 1.2 },
  summaryChipValue: { fontSize: 13, fontWeight: 700 },
  chartLabel: { fontSize: 11, fontWeight: 700, color: "#9A9690", padding: "12px 12px 4px" },
  barRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, padding: "0 12px", alignItems: "end" },
  barCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  barTopLabel: { fontSize: 9, color: "#9A9690", height: 11, fontVariantNumeric: "tabular-nums" },
  barTrack: { height: 64, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" },
  barFill: { width: "62%", borderRadius: "4px 4px 2px 2px", minHeight: 3 },
  barDayLabel: { fontSize: 10, color: "#7A7670", marginTop: 2 },
  monthBarRow: { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3, padding: "0 12px", alignItems: "end" },
  monthCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  monthLabel: { fontSize: 9, color: "#7A7670", marginTop: 2 },
  overlay: { position: "fixed", inset: 0, background: "rgba(58,58,56,0.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  sheet: { background: "#FFFFFF", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "18px 18px 22px", boxSizing: "border-box" },
  sheetHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  sheetTwinTag: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, display: "inline-block", marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: 700 },
  sheetClose: { border: "none", background: "#F2EEE5", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A7670", flexShrink: 0 },
  sheetBody: { marginBottom: 18 },
  fieldLabel: { fontSize: 12, fontWeight: 700, color: "#7A7670", marginTop: 14, marginBottom: 7 },
  segRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  dateTimeRow: { display: "flex", gap: 6 },
  segBtn: { border: "1.5px solid", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  input: { width: "100%", border: "1.5px solid #E7E2D8", borderRadius: 10, padding: "10px 12px", fontSize: 15, boxSizing: "border-box" },
  sheetTimeNote: { fontSize: 11, color: "#9A9690", marginTop: 14 },
  saveBtn: { width: "100%", border: "none", borderRadius: 12, color: "#FFFFFF", fontSize: 15, fontWeight: 700, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" },
};

// ---------------- マウント ----------------
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(e(TwinCareLog));
