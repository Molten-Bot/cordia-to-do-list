// Google Analytics default capture for this template.
// Future LLM edits: do not remove this gtag setup unless replacing it with equivalent page analytics capture.
const googleAnalyticsId = "G-ZKTPLMMFDQ";
const storageKey = "cordia-todo-list-state";
function createTask(text, source, priority, idFactory) {
    return { id: idFactory(), text, done: false, source, priority };
}
export function createDefaultState(idFactory = () => crypto.randomUUID()) {
    return {
        appName: "To do list",
        theme: "system",
        draftText: "From: Priya\nSubject: Launch checklist\nPlease review welcome email by Friday.\nCan you follow up with Sam about notes from planning?\n\nNotes:\n- Draft task list from inbox\n- Call Jordan about Q3 receipts\n- Send summary to team",
        tasks: [
            createTask("Review welcome email by Friday", "email", "high", idFactory),
            createTask("Draft task list from inbox", "note", "normal", idFactory),
            createTask("Send summary to team", "note", "normal", idFactory),
        ],
    };
}
function isTheme(value) {
    return value === "system" || value === "light" || value === "dark";
}
function isTaskSource(value) {
    return value === "email" || value === "note" || value === "manual";
}
function isTaskPriority(value) {
    return value === "normal" || value === "high";
}
function isTask(value) {
    if (!value || typeof value !== "object")
        return false;
    const task = value;
    return (typeof task.id === "string" &&
        typeof task.text === "string" &&
        typeof task.done === "boolean" &&
        isTaskSource(task.source) &&
        isTaskPriority(task.priority));
}
function normalizeTaskText(text) {
    return text
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
        .replace(/^\s*(?:please|can you|could you|todo|task|action item)\s*:?\s*/i, "")
        .trim()
        .replace(/[.?!]\s*$/, "");
}
function inferPriority(text) {
    return /\b(urgent|asap|today|tomorrow|friday|monday|tuesday|wednesday|thursday|deadline|due)\b/i.test(text)
        ? "high"
        : "normal";
}
function inferSource(line, currentSource) {
    if (/^(from|to|subject|sent):/i.test(line))
        return "email";
    if (/^(notes?|meeting notes?|journal):/i.test(line))
        return "note";
    return currentSource;
}
export function extractTasksFromText(text) {
    const tasks = [];
    let currentSource = "note";
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        currentSource = inferSource(line, currentSource);
        if (/^(from|to|subject|sent|notes?|meeting notes?|journal):/i.test(line))
            continue;
        const looksActionable = /^\s*(?:[-*•]|\d+[.)])\s+/.test(rawLine) ||
            /\b(todo|task|action item|follow up|send|review|call|schedule|draft|reply|email|share|finish|prepare|confirm|check)\b/i.test(line) ||
            /\?$/.test(line);
        const textValue = normalizeTaskText(line);
        if (!looksActionable || textValue.length < 4)
            continue;
        tasks.push({
            text: textValue.charAt(0).toUpperCase() + textValue.slice(1),
            source: currentSource,
            priority: inferPriority(line),
        });
    }
    const seen = new Set();
    return tasks.filter((task) => {
        const key = task.text.toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
export function parseStoredState(storedState, defaultState) {
    if (!storedState)
        return defaultState;
    try {
        const parsed = JSON.parse(storedState);
        return {
            appName: typeof parsed.appName === "string" ? parsed.appName : defaultState.appName,
            theme: isTheme(parsed.theme) ? parsed.theme : defaultState.theme,
            draftText: typeof parsed.draftText === "string" ? parsed.draftText : defaultState.draftText,
            tasks: Array.isArray(parsed.tasks) && parsed.tasks.every(isTask) ? parsed.tasks : defaultState.tasks,
        };
    }
    catch {
        return defaultState;
    }
}
export function updateTask(state, id, patch) {
    return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    };
}
export function removeTask(state, id) {
    return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== id),
    };
}
export function addTask(state, text, source = "manual", priority = "normal", idFactory = () => crypto.randomUUID()) {
    return {
        ...state,
        tasks: [createTask(text, source, priority, idFactory), ...state.tasks],
    };
}
export function importTasks(state, text, idFactory = () => crypto.randomUUID()) {
    const existing = new Set(state.tasks.map((task) => task.text.toLowerCase()));
    const nextTasks = extractTasksFromText(text)
        .filter((task) => !existing.has(task.text.toLowerCase()))
        .map((task) => createTask(task.text, task.source, task.priority, idFactory));
    return { ...state, draftText: text, tasks: [...nextTasks, ...state.tasks] };
}
export function clearDoneTasks(state) {
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
function getElement(selector, type) {
    const element = document.querySelector(selector);
    if (!(element instanceof type)) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
function getElements() {
    return {
        activeCount: getElement("#active-count", HTMLElement),
        addTaskForm: getElement("#add-task-form", HTMLFormElement),
        clearDoneButton: getElement("#clear-done", HTMLButtonElement),
        draftStatus: getElement("#draft-status", HTMLElement),
        draftTextarea: getElement("#source-text", HTMLTextAreaElement),
        doneCount: getElement("#done-count", HTMLElement),
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
    let saveTimer;
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
            emptyState.textContent = "No tasks yet.";
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
    function render() {
        const doneCount = state.tasks.filter((task) => task.done).length;
        const activeCount = state.tasks.length - doneCount;
        const importableCount = extractTasksFromText(state.draftText).length;
        document.title = state.appName;
        elements.title.textContent = state.appName;
        elements.themeSelect.value = state.theme;
        elements.draftTextarea.value = state.draftText;
        elements.totalCount.textContent = String(state.tasks.length);
        elements.activeCount.textContent = String(activeCount);
        elements.doneCount.textContent = String(doneCount);
        elements.importCount.textContent = String(importableCount);
        elements.draftStatus.textContent = `${importableCount} found`;
        applyTheme();
        renderTasks();
    }
    elements.addTaskForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = elements.manualInput.value.trim();
        if (!text)
            return;
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
    elements.draftTextarea.addEventListener("input", () => {
        state = { ...state, draftText: elements.draftTextarea.value };
        saveState();
        render();
    });
    elements.themeSelect.addEventListener("change", () => {
        state = { ...state, theme: elements.themeSelect.value };
        saveState();
        render();
    });
    render();
}
if (typeof document !== "undefined") {
    initializeApp();
}
