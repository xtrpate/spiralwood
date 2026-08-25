const express = require("express");
const router = express.Router();
const {
  authenticate,
  authorize,
  requireStaffOrAdmin,
  requireIndoorStaffOrAdmin,
} = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const posTasksController = require("../controllers/staff/pos.tasks");

const allLoggedInStaffOrAdmin = [authenticate, requireStaffOrAdmin];
const adminOnly = [authenticate, authorize("admin")];
const indoorOnlyOrAdmin = [authenticate, requireIndoorStaffOrAdmin];

/* ══════════════════════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════════════════════ */
router.get(
  "/notifications",
  allLoggedInStaffOrAdmin,
  posTasksController.getNotifications,
);
router.patch(
  "/notifications/read-all",
  allLoggedInStaffOrAdmin,
  posTasksController.markAllNotificationsRead,
);
router.patch(
  "/notifications/:id/read",
  allLoggedInStaffOrAdmin,
  posTasksController.markNotificationRead,
);

router.get(
  "/unread-count",
  allLoggedInStaffOrAdmin,
  posTasksController.getUnreadCount,
);

/* ══════════════════════════════════════════════════════════════
   ADMIN ASSIGNMENT SUPPORT
══════════════════════════════════════════════════════════════ */
router.get("/staff-list", adminOnly, posTasksController.getStaff);
router.get("/orders-list", adminOnly, posTasksController.getProjects);
router.get("/projects", adminOnly, posTasksController.getProjects);
router.get("/staff", adminOnly, posTasksController.getStaff);

/* ══════════════════════════════════════════════════════════════
   PROJECT TASKS
══════════════════════════════════════════════════════════════ */
router.get("/", indoorOnlyOrAdmin, posTasksController.getTasks);
router.get(
  "/orders/:orderId/blueprint",
  indoorOnlyOrAdmin,
  posTasksController.getAssignedOrderBlueprint,
);
router.post("/", adminOnly, posTasksController.createTask);

router.put(
  "/:id",
  adminOnly,
  logAction("update_project_task", "project_tasks"),
  posTasksController.updateTask,
);
router.delete(
  "/:id",
  adminOnly,
  logAction("delete_project_task", "project_tasks"),
  posTasksController.deleteTask,
);

router.put("/:id/accept", indoorOnlyOrAdmin, (req, res) => {
  return res.status(410).json({
    message:
      "This endpoint is no longer supported. Use PUT /api/tasks/:id/status to start a task.",
  });
});
router.put(
  "/:id/status",
  indoorOnlyOrAdmin,
  logAction("update_project_task_status", "project_tasks"),
  posTasksController.updateTaskStatus,
);

module.exports = router;