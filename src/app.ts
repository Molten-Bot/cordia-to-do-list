// Google Analytics default capture for this template.
// Future LLM edits: do not remove this gtag setup unless replacing it with equivalent page analytics capture.
const googleAnalyticsId = "G-ZKTPLMMFDQ";
const storageKey = "cordia-todo-list-state";

type Theme = "system" | "light" | "dark";
type TaskSource = "email" | "note" | "manual";
type TaskPriority = "normal" | "high";

export interface Task {
  id: string;
  text: string;
  done: boolean;
  source: TaskSource;
  priority: TaskPriority;
}

export interface AppState {
  appName: string;
  theme: Theme;
  inboxAddress: string;
  draftText: string;
  tasks: Task[];
}

type TaskPatch = Partial<Pick<Task, "text" | "done" | "priority">>;

interface AppElements {
  activeCount: HTMLElement;
  addTaskForm: HTMLFormElement;
  clearDoneButton: HTMLButtonElement;
  draftStatus: HTMLElement;
  draftTextarea: HTMLTextAreaElement;
  doneCount: HTMLElement;
  inboxAddressInput: HTMLInputElement;
  inboxCopyButton: HTMLButtonElement;
  inboxStatus: HTMLElement;
  importButton: HTMLButtonElement;
  importCount: HTMLElement;
  manualInput: HTMLInputElement;
  saveState: HTMLElement;
  taskList: HTMLUListElement;
  themeSelect: HTMLSelectElement;
  title: HTMLHeadingElement;
  totalCount: HTMLElement;
}

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
  }
}

function createTask(
  text: string,
  source: TaskSource,
  priority: TaskPriority,
  idFactory: () => string,
): Task {
  return { id: idFactory(), text, done: false, source, priority };
}

export function createDefaultState(idFactory: () => string = () => crypto.randomUUID()): AppState {
  return {
    appName: "To do list",
    theme: "system",
    inboxAddress: "MYNAME+todo@gmail.com",
    draftText:
      "From: Priya\nSubject: Launch checklist\nPlease review welcome email by Friday.\nCan you follow up with Sam about notes from planning?\n\nNotes:\n- Draft task list from inbox\n- Call Jordan about Q3 receipts\n- Send summary to team",
    tasks: [
      createTask("Review welcome email by Friday", "email", "high", idFactory),
      createTask("Draft task list from inbox", "note", "normal", idFactory),
      createTask("Send summary to team", "note", "normal", idFactory),
    ],
  };
}

function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

function isTaskSource(value: unknown): value is TaskSource {
  return value === "email" || value === "note" || value === "manual";
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "normal" || value === "high";
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.text === "string" &&
    typeof task.done === "boolean" &&
    isTaskSource(task.source) &&
    isTaskPriority(task.priority)
  );
}

function normalizeTaskText(text: string): string {
  return text
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/^\s*(?:also|please|can you|could you|todo|task|action item|next step)\s*:?\s*/i, "")
    .trim()
    .replace(/[.?!]\s*$/, "");
}

function inferPriority(text: string): TaskPriority {
  return /\b(urgent|asap|today|tomorrow|friday|monday|tuesday|wednesday|thursday|deadline|due)\b/i.test(text)
    ? "high"
    : "normal";
}

function inferSource(line: string, currentSource: TaskSource): TaskSource {
  if (/^(from|to|cc|bcc|subject|sent|date):/i.test(line)) return "email";
  if (/^(notes?|meeting notes?|journal|minutes):/i.test(line)) return "note";
  return currentSource;
}

function isSourceHeader(line: string): boolean {
  return /^(from|to|cc|bcc|subject|sent|date|notes?|meeting notes?|journal|minutes):/i.test(line);
}

function isActionHeading(line: string): boolean {
  return /^(action items?|next steps?|todos?|tasks?):\s*$/i.test(line);
}

function isSectionHeading(line: string): boolean {
  return /^[a-z][a-z\s/-]{1,32}:\s*$/i.test(line);
}

function splitTaskCandidates(rawLine: string): string[] {
  if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(rawLine)) return [rawLine.trim()];
  return (rawLine.match(/[^.?!]+[.?!]?/g) ?? [rawLine]).map((candidate) => candidate.trim()).filter(Boolean);
}

function looksActionable(candidate: string, rawLine: string, inActionSection: boolean): boolean {
  return (
    inActionSection ||
    /^\s*(?:[-*•]|\d+[.)])\s+/.test(rawLine) ||
    /\b(todo|task|action item|next step|follow up|send|review|call|schedule|draft|reply|email|share|finish|prepare|confirm|check|update|book|pay|submit)\b/i.test(
      candidate,
    ) ||
    /\?$/.test(candidate)
  );
}

export function extractTasksFromText(text: string): Array<Omit<Task, "id" | "done">> {
  const tasks: Array<Omit<Task, "id" | "done">> = [];
  let currentSource: TaskSource = "note";
  let inActionSection = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    currentSource = inferSource(line, currentSource);
    if (isSourceHeader(line)) {
      inActionSection = false;
      continue;
    }
    if (isActionHeading(line)) {
      inActionSection = true;
      continue;
    }
    if (isSectionHeading(line)) {
      inActionSection = false;
      continue;
    }

    for (const candidate of splitTaskCandidates(rawLine)) {
      const textValue = normalizeTaskText(candidate);
      if (!looksActionable(candidate, rawLine, inActionSection) || textValue.length < 4) continue;

      tasks.push({
        text: textValue.charAt(0).toUpperCase() + textValue.slice(1),
        source: currentSource,
        priority: inferPriority(candidate),
      });
    }
  }

  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = task.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseStoredState(storedState: string | null, defaultState: AppState): AppState {
  if (!storedState) return defaultState;

  try {
    const parsed = JSON.parse(storedState) as Record<string, unknown>;
    return {
      appName: typeof parsed.appName === "string" ? parsed.appName : defaultState.appName,
      theme: isTheme(parsed.theme) ? parsed.theme : defaultState.theme,
      inboxAddress:
        typeof parsed.inboxAddress === "string" && isEmailAddress(parsed.inboxAddress)
          ? parsed.inboxAddress
          : defaultState.inboxAddress,
      draftText: typeof parsed.draftText === "string" ? parsed.draftText : defaultState.draftText,
      tasks: Array.isArray(parsed.tasks) && parsed.tasks.every(isTask) ? parsed.tasks : defaultState.tasks,
    };
  } catch {
    return defaultState;
  }
}

export function updateTask(state: AppState, id: string, patch: TaskPatch): AppState {
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
  };
}

export function removeTask(state: AppState, id: string): AppState {
  return {
    ...state,
    tasks: state.tasks.filter((task) => task.id !== id),
  };
}

export function addTask(
  state: AppState,
  text: string,
  source: TaskSource = "manual",
  priority: TaskPriority = "normal",
  idFactory: () => string = () => crypto.randomUUID(),
): AppState {
  return {
    ...state,
    tasks: [createTask(text, source, priority, idFactory), ...state.tasks],
  };
}

export function importTasks(
  state: AppState,
  text: string,
  idFactory: () => string = () => crypto.randomUUID(),
): AppState {
  const existing = new Set(state.tasks.map((task) => task.text.toLowerCase()));
  const nextTasks = extractTasksFromText(text)
    .filter((task) => !existing.has(task.text.toLowerCase()))
    .map((task) => createTask(task.text, task.source, task.priority, idFactory));

  return { ...state, draftText: text, tasks: [...nextTasks, ...state.tasks] };
}

export function clearDoneTasks(state: AppState): AppState {
  return { ...state, tasks: state.tasks.filter((task) => !task.done) };
}

function initializeGoogleAnalytics() {
  const googleTagScript = document.createElement("script");
  googleTagScript.async = true;
  googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
  document.head.append(googleTagScript);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", googleAnalyticsId);
}

function getElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function getElements(): AppElements {
  return {
    activeCount: getElement("#active-count", HTMLElement),
    addTaskForm: getElement("#add-task-form", HTMLFormElement),
    clearDoneButton: getElement("#clear-done", HTMLButtonElement),
    draftStatus: getElement("#draft-status", HTMLElement),
    draftTextarea: getElement("#source-text", HTMLTextAreaElement),
    doneCount: getElement("#done-count", HTMLElement),
    inboxAddressInput: getElement("#inbox-address", HTMLInputElement),
    inboxCopyButton: getElement("#copy-inbox-address", HTMLButtonElement),
    inboxStatus: getElement("#inbox-status", HTMLElement),
    importButton: getElement("#import-tasks", HTMLButtonElement),
    importCount: getElement("#import-count", HTMLElement),
    manualInput: getElement("#manual-task", HTMLInputElement),
    saveState: getElement("#save-state", HTMLElement),
    taskList: getElement("#task-list", HTMLUListElement),
    themeSelect: getElement("#theme-select", HTMLSelectElement),
    title: getElement(".topbar h1", HTMLHeadingElement),
    totalCount: getElement("#total-count", HTMLElement),
  };
}

function initializeApp() {
  initializeGoogleAnalytics();

  const defaultState = createDefaultState();
  const elements = getElements();
  let state = parseStoredState(localStorage.getItem(storageKey), defaultState);
  let saveTimer: number | undefined;

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    elements.saveState.textContent = "Saved";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      elements.saveState.textContent = "Autosaved";
    }, 1600);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
  }

  function renderTasks() {
    elements.taskList.replaceChildren();

    if (state.tasks.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "Paste email threads or notes, then import tasks.";
      elements.taskList.append(emptyState);
      return;
    }

    state.tasks.forEach((task) => {
      const row = document.createElement("li");
      row.className = "task-row";
      row.dataset.done = String(task.done);
      row.dataset.priority = task.priority;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.done;
      checkbox.ariaLabel = `Mark ${task.text} complete`;
      checkbox.addEventListener("change", () => {
        state = updateTask(state, task.id, { done: checkbox.checked });
        saveState();
        render();
      });

      const body = document.createElement("div");
      body.className = "task-body";

      const label = document.createElement("span");
      label.textContent = task.text;

      const meta = document.createElement("small");
      meta.textContent = `${task.source} · ${task.priority}`;

      body.append(label, meta);

      const priorityButton = document.createElement("button");
      priorityButton.className = "icon-button";
      priorityButton.type = "button";
      priorityButton.title = "Toggle priority";
      priorityButton.ariaLabel = `Toggle priority for ${task.text}`;
      priorityButton.textContent = task.priority === "high" ? "!" : "↑";
      priorityButton.addEventListener("click", () => {
        state = updateTask(state, task.id, { priority: task.priority === "high" ? "normal" : "high" });
        saveState();
        render();
      });

      const removeButton = document.createElement("button");
      removeButton.className = "icon-button";
      removeButton.type = "button";
      removeButton.title = "Remove";
      removeButton.ariaLabel = `Remove ${task.text}`;
      removeButton.textContent = "x";
      removeButton.addEventListener("click", () => {
        state = removeTask(state, task.id);
        saveState();
        render();
      });

      row.append(checkbox, body, priorityButton, removeButton);
      elements.taskList.append(row);
    });
  }

  function render({ syncDraftTextarea = false }: { syncDraftTextarea?: boolean } = {}) {
    const doneCount = state.tasks.filter((task) => task.done).length;
    const activeCount = state.tasks.length - doneCount;
    const importableCount = extractTasksFromText(state.draftText).length;

    document.title = state.appName;
    elements.title.textContent = state.appName;
    elements.themeSelect.value = state.theme;
    if (elements.inboxAddressInput.value !== state.inboxAddress) {
      elements.inboxAddressInput.value = state.inboxAddress;
    }
    elements.inboxCopyButton.disabled = !isEmailAddress(state.inboxAddress);
    elements.inboxStatus.textContent = isEmailAddress(state.inboxAddress)
      ? "Forwarding target ready"
      : "Enter valid email";
    if (syncDraftTextarea && elements.draftTextarea.value !== state.draftText) {
      elements.draftTextarea.value = state.draftText;
    }
    elements.totalCount.textContent = String(state.tasks.length);
    elements.activeCount.textContent = String(activeCount);
    elements.doneCount.textContent = String(doneCount);
    elements.importCount.textContent = String(importableCount);
    elements.draftStatus.textContent = `${importableCount} found`;
    elements.importButton.disabled = importableCount === 0;
    applyTheme();
    renderTasks();
  }

  elements.addTaskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = elements.manualInput.value.trim();
    if (!text) return;
    state = addTask(state, text);
    saveState();
    render();
    elements.manualInput.value = "";
    elements.manualInput.focus();
  });

  elements.importButton.addEventListener("click", () => {
    state = importTasks(state, elements.draftTextarea.value);
    saveState();
    render();
  });

  elements.clearDoneButton.addEventListener("click", () => {
    state = clearDoneTasks(state);
    saveState();
    render();
  });

  elements.inboxAddressInput.addEventListener("input", () => {
    state = { ...state, inboxAddress: elements.inboxAddressInput.value.trim() };
    saveState();
    render();
  });

  elements.inboxCopyButton.addEventListener("click", async () => {
    if (!isEmailAddress(state.inboxAddress)) return;

    try {
      await navigator.clipboard.writeText(state.inboxAddress);
      elements.inboxStatus.textContent = "Copied";
    } catch {
      elements.inboxAddressInput.select();
      elements.inboxStatus.textContent = "Select and copy";
    }
  });

  elements.draftTextarea.addEventListener("input", () => {
    state = { ...state, draftText: elements.draftTextarea.value };
    saveState();
    render();
  });

  elements.themeSelect.addEventListener("change", () => {
    state = { ...state, theme: elements.themeSelect.value as Theme };
    saveState();
    render();
  });

  render({ syncDraftTextarea: true });
}

if (typeof document !== "undefined") {
  initializeApp();
}
