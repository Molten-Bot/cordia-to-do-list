import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addTask,
  clearDoneTasks,
  createDefaultState,
  extractTasksFromText,
  importTasks,
  parseStoredState,
  removeTask,
  updateTask,
} from "../public/app.js";

test("createDefaultState uses supplied id factory", () => {
  let nextId = 1;
  const state = createDefaultState(() => `task-${nextId++}`);

  assert.deepEqual(
    state.tasks.map((task) => task.id),
    ["task-1", "task-2", "task-3"],
  );
  assert.equal(state.appName, "To do list");
});

test("extractTasksFromText finds action lines from emails and notes", () => {
  const extracted = extractTasksFromText(`From: Alex
Subject: Thursday plan
Please review launch notes by Friday.
Can you follow up with Mia?

Notes:
- Call Jordan about receipts
- Draft rollout summary`);

  assert.deepEqual(extracted, [
    { text: "Review launch notes by Friday", source: "email", priority: "high" },
    { text: "Follow up with Mia", source: "email", priority: "normal" },
    { text: "Call Jordan about receipts", source: "note", priority: "normal" },
    { text: "Draft rollout summary", source: "note", priority: "normal" },
  ]);
});

test("parseStoredState merges valid stored values with defaults", () => {
  const defaultState = createDefaultState(() => "default-id");
  const stored = JSON.stringify({
    appName: "To do list",
    theme: "dark",
    draftText: "Notes:\n- Send invoice",
    tasks: [{ id: "stored-id", text: "Stored task", done: true, source: "note", priority: "high" }],
  });

  assert.deepEqual(parseStoredState(stored, defaultState), {
    appName: "To do list",
    theme: "dark",
    draftText: "Notes:\n- Send invoice",
    tasks: [{ id: "stored-id", text: "Stored task", done: true, source: "note", priority: "high" }],
  });
});

test("parseStoredState falls back when stored JSON is invalid", () => {
  const defaultState = createDefaultState(() => "default-id");

  assert.equal(parseStoredState("{", defaultState), defaultState);
});

test("task reducers add, update, remove, import, and clear immutably", () => {
  const state = {
    appName: "To do list",
    theme: "system",
    draftText: "",
    tasks: [
      { id: "one", text: "One", done: false, source: "manual", priority: "normal" },
      { id: "two", text: "Two", done: true, source: "email", priority: "high" },
    ],
  };

  const added = addTask(state, "Three", "manual", "normal", () => "three");
  const imported = importTasks(added, "Notes:\n- Send report\n- One", () => "four");
  const updated = updateTask(imported, "one", { done: true });
  const removed = removeTask(updated, "two");
  const cleared = clearDoneTasks(removed);

  assert.deepEqual(added.tasks[0], {
    id: "three",
    text: "Three",
    done: false,
    source: "manual",
    priority: "normal",
  });
  assert.deepEqual(imported.tasks[0], {
    id: "four",
    text: "Send report",
    done: false,
    source: "note",
    priority: "normal",
  });
  assert.equal(state.tasks[0].done, false);
  assert.deepEqual(
    cleared.tasks.map((task) => task.text),
    ["Send report", "Three"],
  );
});

test("served files do not reference disallowed providers or tooling", async () => {
  const servedFiles = [
    "public/app.js",
    "public/humans.txt",
    "public/index.html",
    "public/llm.txt",
  ];

  for (const file of servedFiles) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /\bgit\b|cloudflare/i, file);
  }
});
