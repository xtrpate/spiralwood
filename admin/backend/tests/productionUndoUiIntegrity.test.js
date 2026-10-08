const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const taskController = read("admin/backend/controllers/staff/pos.tasks.js");
const staffPage = read("admin/frontend/src/pages/staff/MyTasks.jsx");

const tasksStart = taskController.indexOf("exports.getTasks = async");
const tasksEnd = taskController.indexOf("exports.getAssignedOrderBlueprint =", tasksStart);
assert.ok(tasksStart >= 0 && tasksEnd > tasksStart);
const getTasksSource = taskController.slice(tasksStart, tasksEnd);
assert.match(
  getTasksSource,
  /o\.status AS order_status/,
  "The staff task response must include the current order status.",
);

assert.match(
  staffPage,
  /orderStatus: normalize\(task\.order_status\)/,
  "Staff production packets must track their parent order status.",
);

const undoStart = staffPage.indexOf("const canUndoThisStep =");
const undoEnd = staffPage.indexOf("const previousStep =", undoStart);
assert.ok(undoStart >= 0 && undoEnd > undoStart);
const undoDecision = staffPage.slice(undoStart, undoEnd);
const canUndo = new Function(
  "order",
  "step",
  "stepIndex",
  "normalize",
  undoDecision + "\nreturn canUndoThisStep;",
);
const normalize = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const labels = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const checkUndo = (
  orderStatus,
  stepIndex = 4,
  laterStatus = "pending",
  packetIntegrityOk = true,
) => {
  const steps = labels.map((stepLabel, index) => ({
    stepLabel,
    status: index <= stepIndex ? "completed" : laterStatus,
    task: { id: index + 1 },
  }));
  const order = { orderStatus, packetIntegrityOk, steps };
  return canUndo(order, steps[stepIndex], stepIndex, normalize);
};

assert.equal(checkUndo("production"), true);
assert.equal(checkUndo("ready_for_pickup"), true);
for (const status of [
  "shipping",
  "delivered",
  "completed",
  "cancelled",
  "",
]) {
  assert.equal(
    checkUndo(status),
    false,
    "Completed Packing must not offer Undo Done once order status is " + (status || "missing"),
  );
}
assert.equal(checkUndo("production", 2), true);
assert.equal(checkUndo("production", 2, "in_progress"), false);
assert.equal(checkUndo("ready_for_pickup", 2), false);
assert.equal(checkUndo("production", 4, "pending", false), false);

const taskListenerStart = staffPage.indexOf("const handleTaskUpdated =");
const taskListenerEnd = staffPage.indexOf("const updateTaskStatus =", taskListenerStart);
assert.ok(taskListenerStart >= 0 && taskListenerEnd > taskListenerStart);
const realtimeSource = staffPage.slice(taskListenerStart, taskListenerEnd);
assert.match(
  realtimeSource,
  /socket\.on\("order:status_updated", handleOrderStatusUpdated\)/,
  "Staff page must refresh when shipping or other order status changes are received.",
);
assert.match(
  realtimeSource,
  /currentSocket\.off\("order:status_updated", handleOrderStatusUpdated\)/,
  "Order status listener must be removed during component cleanup.",
);

console.log(
  "PASS: Production Undo UI order-stage guard and realtime refresh regression checks.",
);
