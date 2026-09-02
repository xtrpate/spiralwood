// controllers/staff/pos.tasks.js
const db = require("../../config/db"); // Uses the unified db config
const {
  createNotificationSafe,
} = require("../../utils/notificationHelper");

const ensureIndoorAssignee = async (userId) => {
  // ── FIXED: Switched to .query and parsed ID ──
  const [rows] = await db.query(
    `SELECT id, name, role, staff_type, is_active
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [parseInt(userId)],
  );

  if (!rows.length) return null;

  const user = rows[0];

  if (user.role !== "staff") return null;
  if (user.staff_type !== "indoor") return null;
  if (!user.is_active) return null;

  return user;
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const REQUIRED_PRODUCTION_STEPS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const REQUIRED_PRODUCTION_STEP_KEYS = REQUIRED_PRODUCTION_STEPS.map(normalize);

const validateProductionSequence = async ({
  orderId,
  taskRole,
  currentStatus,
  nextStatus,
}) => {
  const currentTaskRoleKey = normalize(taskRole);
  const currentStepIndex =
    REQUIRED_PRODUCTION_STEP_KEYS.indexOf(currentTaskRoleKey);

  if (!orderId || currentStepIndex === -1) {
    return null;
  }

  const normalizedCurrentStatus = normalize(currentStatus);
  const normalizedNextStatus = normalize(nextStatus);

  // ── FIXED: Switched to .query and parsed ID ──
  const [packetRows] = await db.query(
    `SELECT id, task_role, status
     FROM project_tasks
     WHERE order_id = ?`,
    [parseInt(orderId)],
  );

  const packetMap = new Map(
    packetRows.map((row) => [normalize(row.task_role), row]),
  );

  for (let i = 0; i < currentStepIndex; i += 1) {
    const previousStepLabel = REQUIRED_PRODUCTION_STEPS[i];
    const previousStepKey = REQUIRED_PRODUCTION_STEP_KEYS[i];
    const previousStep = packetMap.get(previousStepKey);

    if (!previousStep || normalize(previousStep.status) !== "completed") {
      return `Complete ${previousStepLabel} first before starting ${taskRole}.`;
    }
  }

  if (
    normalizedNextStatus === "in_progress" &&
    !["pending", "blocked"].includes(normalizedCurrentStatus)
  ) {
    return "Only a pending or blocked step can be started.";
  }

  if (
    normalizedNextStatus === "completed" &&
    normalizedCurrentStatus !== "in_progress"
  ) {
    return "Only an in-progress step can be marked as completed.";
  }

  if (
    normalizedNextStatus === "blocked" &&
    normalizedCurrentStatus !== "in_progress"
  ) {
    return "Only an in-progress step can be marked as blocked.";
  }

  return null;
};

/* ── Get User Notifications ── */
exports.getNotifications = async (req, res) => {
  try {
    // WISDOM NOTIFICATION HISTORY PAGING V1
    // Keep this endpoint array-shaped for existing clients while allowing
    // the admin notification center to progressively load older history.
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;

    const [notifications] = await db.query(
      `SELECT *
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [parseInt(req.user.id), limit, offset],
    );

    res.json(notifications);
  } catch (err) {
    console.error("[pos.tasks GET /notifications]", err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

/* ── Mark Notification as Read ── */
exports.markNotificationRead = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed IDs ──
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [parseInt(req.params.id), parseInt(req.user.id)],
    );
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Error updating notification" });
  }
};

/* ── Mark All Notifications as Read ── */
exports.markAllNotificationsRead = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [parseInt(req.user.id)],
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("[pos.tasks PATCH /notifications/read-all]", err);
    res.status(500).json({ message: "Error updating notifications" });
  }
};

/* ── Get Projects Requiring Allocation ── */
exports.getProjects = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added empty array [] ──
    const [projects] = await db.query(
      `
      SELECT 
        o.id,
        o.order_number,
        COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
        o.status,
        o.delivery_address,
        o.created_at,
        (
          SELECT COUNT(*)
          FROM project_tasks pt
          WHERE pt.order_id = o.id
        ) AS assigned_tasks_count
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      WHERE o.status IN ('confirmed', 'production')
      ORDER BY o.created_at DESC
    `,
      [],
    );
    res.json(projects);
  } catch (err) {
    console.error("[pos.tasks GET /projects]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Get Staff Workload ── */
exports.getStaff = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added empty array [] ──
    const [staff] = await db.query(
      `SELECT
         u.id,
         u.name,
         u.role,
         u.staff_type,
         u.phone,
         (
           SELECT COUNT(*)
           FROM project_tasks pt
           WHERE pt.assigned_to = u.id
             AND pt.status IN ('pending', 'in_progress', 'blocked')
         ) AS active_tasks
       FROM users u
       WHERE u.role = 'staff'
         AND u.staff_type = 'indoor'
         AND u.is_active = 1
       ORDER BY u.name ASC`,
      [],
    );

    res.json(staff);
  } catch (err) {
    console.error("[pos.tasks GET /staff]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Get Unread Count ── */
exports.getUnreadCount = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [taskRows] = await db.query(
      `SELECT COUNT(*) as count FROM project_tasks WHERE assigned_to = ? AND is_read = 0`,
      [parseInt(req.user.id)],
    );

    // ── FIXED: Switched to .query and parsed ID ──
    const [notifRows] = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [parseInt(req.user.id)],
    );

    res.json({
      task_count: taskRows[0].count,
      notification_count: notifRows[0].count,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching unread count" });
  }
};

/* ── Get Tasks (Admin sees all, Staff sees theirs) ── */
exports.getTasks = async (req, res) => {
  try {
    let query = `
      SELECT t.*,
             assignee.name AS assigned_to_name,
             assigner.name AS assigned_by_name,
             o.order_number,
             o.delivery_address,
             COALESCE(customer.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name
      FROM project_tasks t
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      LEFT JOIN users assigner ON t.assigned_by = assigner.id
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN users customer ON o.customer_id = customer.id
    `;
    const queryParams = [];

    if (req.user.role !== "admin") {
      const staffId = parseInt(req.user.id, 10);

      // Staff need the whole order packet so production sequence/progress stays
      // correct after reassignment. An order belongs in My Production Work while
      // this staff member owns at least one unfinished step. Once the whole
      // packet is completed, only the staff member who completed Packing keeps
      // the finished packet in Ready/history.
      query += `
        WHERE (
          (
            t.order_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM project_tasks owned
                WHERE owned.order_id = t.order_id
                  AND owned.assigned_to = ?
                  AND owned.status IN ('pending', 'in_progress', 'blocked')
              )
              OR (
                NOT EXISTS (
                  SELECT 1
                  FROM project_tasks unfinished
                  WHERE unfinished.order_id = t.order_id
                    AND unfinished.status <> 'completed'
                )
                AND EXISTS (
                  SELECT 1
                  FROM project_tasks final_step
                  WHERE final_step.order_id = t.order_id
                    AND LOWER(TRIM(final_step.task_role)) = 'packing'
                    AND final_step.assigned_to = ?
                    AND final_step.status = 'completed'
                )
              )
            )
          )
          OR (t.order_id IS NULL AND t.assigned_to = ?)
        )
      `;
      queryParams.push(staffId, staffId, staffId);
    }

    query += ` ORDER BY t.created_at DESC`;

    const [tasks] = await db.query(query, queryParams);

    // Hold reasons are intentionally stored in audit_logs instead of adding
    // another project_tasks column. Only the latest reason for a task that is
    // currently blocked/on hold is exposed to the UI.
    const blockedTaskIds = tasks
      .filter((task) => normalize(task.status) === "blocked")
      .map((task) => Number(task.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (blockedTaskIds.length > 0) {
      const placeholders = blockedTaskIds.map(() => "?").join(", ");
      const [auditRows] = await db.query(
        `SELECT record_id, new_values
         FROM audit_logs
         WHERE table_name = 'project_tasks'
           AND record_id IN (${placeholders})
         ORDER BY id DESC`,
        blockedTaskIds,
      );

      const reasonByTaskId = new Map();

      for (const row of auditRows) {
        const recordId = Number(row.record_id);
        if (!Number.isInteger(recordId) || reasonByTaskId.has(recordId)) continue;

        let nextValues = row.new_values;
        if (typeof nextValues === "string") {
          try {
            nextValues = JSON.parse(nextValues);
          } catch {
            nextValues = null;
          }
        }

        const holdReason = String(nextValues?.hold_reason || "").trim();
        if (normalize(nextValues?.status) === "blocked" && holdReason) {
          reasonByTaskId.set(recordId, holdReason);
        }
      }

      for (const task of tasks) {
        if (normalize(task.status) === "blocked") {
          task.hold_reason = reasonByTaskId.get(Number(task.id)) || null;
        }
      }
    }

    res.json(tasks);
  } catch (err) {
    console.error("[pos.tasks GET /]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Get Assigned Production Blueprint (Indoor Staff/Admin) ── */
exports.getAssignedOrderBlueprint = async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid production order." });
    }

    let assignmentQuery = `
      SELECT
        pt.blueprint_id AS task_blueprint_id,
        o.blueprint_id AS order_blueprint_id,
        o.order_number,
        o.status AS order_status
      FROM project_tasks pt
      INNER JOIN orders o ON o.id = pt.order_id
      WHERE pt.order_id = ?
    `;
    const queryParams = [orderId];

    if (req.user.role !== "admin") {
      assignmentQuery += ` AND pt.assigned_to = ?`;
      queryParams.push(parseInt(req.user.id, 10));
    }

    assignmentQuery += `
      ORDER BY (pt.blueprint_id IS NOT NULL) DESC, pt.id ASC
      LIMIT 1
    `;

    const [assignments] = await db.query(assignmentQuery, queryParams);

    if (!assignments.length) {
      return res.status(404).json({
        message: "Production work not found for your account.",
      });
    }

    const assignment = assignments[0];
    const blueprintId = Number(
      assignment.task_blueprint_id || assignment.order_blueprint_id || 0,
    );

    if (!Number.isInteger(blueprintId) || blueprintId <= 0) {
      return res.status(404).json({
        message: "No production Blueprint is linked to this work.",
      });
    }

    const [blueprintRows] = await db.query(
      `SELECT
         b.id,
         b.title,
         b.description,
         b.stage,
         b.design_data,
         b.view_3d_data,
         b.created_at,
         b.updated_at
       FROM blueprints b
       WHERE b.id = ?
       LIMIT 1`,
      [blueprintId],
    );

    if (!blueprintRows.length) {
      return res.status(404).json({
        message: "The production Blueprint is no longer available.",
      });
    }

    const [components] = await db.query(
      `SELECT *
       FROM blueprint_components
       WHERE blueprint_id = ?
       ORDER BY id ASC`,
      [blueprintId],
    );

    const [orderItems] = await db.query(
      `SELECT
         oi.id,
         oi.product_id,
         oi.product_name,
         oi.quantity,
         oi.customization_json,
         p.blueprint_id AS product_blueprint_id
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [orderId],
    );

    const parseCustomization = (value) => {
      if (!value) return null;
      if (typeof value === "object" && !Buffer.isBuffer(value)) return value;

      try {
        return JSON.parse(String(value));
      } catch {
        return null;
      }
    };

    const preparedItems = orderItems.map((item) => ({
      item,
      customization: parseCustomization(item.customization_json),
    }));

    const hasSnapshot = ({ customization }) =>
      Array.isArray(customization?.editor_snapshot?.components) &&
      customization.editor_snapshot.components.length > 0;

    const exactCandidates = preparedItems.filter(({ item, customization }) => {
      if (!hasSnapshot({ customization })) return false;

      const savedBlueprintId = Number(customization?.blueprint_id || 0);
      const productBlueprintId = Number(item?.product_blueprint_id || 0);

      return (
        savedBlueprintId === blueprintId ||
        productBlueprintId === blueprintId
      );
    });

    const fallbackCandidates = preparedItems.filter(hasSnapshot);
    const candidates =
      exactCandidates.length > 0
        ? exactCandidates
        : fallbackCandidates.length === 1
          ? fallbackCandidates
          : [];

    const snapshotSignature = ({ customization }) =>
      JSON.stringify({
        components: customization?.editor_snapshot?.components || [],
        width:
          customization?.width ??
          customization?.width_mm ??
          customization?.customization_snapshot?.width ??
          customization?.customization_snapshot?.width_mm ??
          null,
        height:
          customization?.height ??
          customization?.height_mm ??
          customization?.customization_snapshot?.height ??
          customization?.customization_snapshot?.height_mm ??
          null,
        depth:
          customization?.depth ??
          customization?.depth_mm ??
          customization?.customization_snapshot?.depth ??
          customization?.customization_snapshot?.depth_mm ??
          null,
        wood_type:
          customization?.wood_type ??
          customization?.customization_snapshot?.wood_type ??
          null,
        finish_color:
          customization?.finish_color ??
          customization?.customization_snapshot?.finish_color ??
          null,
        color:
          customization?.color ??
          customization?.customization_snapshot?.color ??
          null,
        hardware:
          customization?.hardware ??
          customization?.customization_snapshot?.hardware ??
          null,
      });

    if (candidates.length > 1) {
      const signatures = new Set(candidates.map(snapshotSignature));

      if (signatures.size > 1) {
        return res.status(409).json({
          message:
            "This production order contains multiple different customized items for the same Blueprint. Ask an administrator to identify the exact production item.",
        });
      }
    }

    const selected = candidates[0] || null;

    let productionBlueprint = {
      ...blueprintRows[0],
      components,
    };
    let designSource = "approved_blueprint";
    let selectedOrderItem = null;

    if (selected) {
      const customization = selected.customization;
      const editorSnapshot = customization.editor_snapshot;
      const customComponents = editorSnapshot.components;
      const customizationSnapshot =
        customization.customization_snapshot &&
        typeof customization.customization_snapshot === "object"
          ? customization.customization_snapshot
          : {};

      const firstPart = customComponents[0] || {};
      const material = String(
        customization.wood_type ||
          customizationSnapshot.wood_type ||
          firstPart.material ||
          firstPart.wood_type ||
          "",
      ).trim();
      const hardware = String(
        customization.hardware ||
          customizationSnapshot.hardware ||
          firstPart.hardware ||
          "",
      ).trim();
      const doorStyle = String(
        customization.door_style ||
          customizationSnapshot.door_style ||
          "",
      ).trim();

      const positiveNumber = (...values) => {
        for (const value of values) {
          const number = Number(value);
          if (Number.isFinite(number) && number > 0) return number;
        }
        return 0;
      };

      const widthMm = positiveNumber(
        customization.width,
        customization.width_mm,
        customizationSnapshot.width,
        customizationSnapshot.width_mm,
      );
      const heightMm = positiveNumber(
        customization.height,
        customization.height_mm,
        customizationSnapshot.height,
        customizationSnapshot.height_mm,
      );
      const depthMm = positiveNumber(
        customization.depth,
        customization.depth_mm,
        customizationSnapshot.depth,
        customizationSnapshot.depth_mm,
      );

      const defaultDimensions = {};
      if (widthMm > 0) defaultDimensions.width_mm = widthMm;
      if (heightMm > 0) defaultDimensions.height_mm = heightMm;
      if (depthMm > 0) defaultDimensions.depth_mm = depthMm;

      const productionDesignData = {
        ...editorSnapshot,
        components: customComponents,
        ...(material ? { woodType: material } : {}),
        ...(hardware ? { hardware } : {}),
        ...(Object.keys(defaultDimensions).length
          ? {
              customerCustomization: {
                ...(editorSnapshot.customerCustomization || {}),
                default_dimensions: defaultDimensions,
              },
            }
          : {}),
      };

      productionBlueprint = {
        ...productionBlueprint,
        title: selected.item.product_name || productionBlueprint.title,
        design_data: JSON.stringify(productionDesignData),
        view_3d_data: JSON.stringify(productionDesignData),
        components: customComponents,
        ...(Object.keys(defaultDimensions).length
          ? { default_dimensions: defaultDimensions }
          : {}),
        ...(material ? { primary_material: material, wood_type: material } : {}),
        ...(hardware ? { hardware } : {}),
        ...(doorStyle ? { door_style: doorStyle } : {}),
      };

      selectedOrderItem = {
        id: selected.item.id,
        product_id: selected.item.product_id,
        product_name: selected.item.product_name,
        quantity: selected.item.quantity,
      };
      designSource = "order_customization";
    }

    return res.json({
      order: {
        id: orderId,
        order_number: assignment.order_number,
        status: assignment.order_status,
      },
      order_item: selectedOrderItem,
      design_source: designSource,
      blueprint: productionBlueprint,
    });
  } catch (err) {
    console.error("[pos.tasks GET /orders/:orderId/blueprint]", err);
    return res.status(500).json({
      message: "Failed to load the production Blueprint.",
    });
  }
};

/* ── Create/Assign Task ── */
exports.createTask = async (req, res) => {
  return res.status(400).json({
    message: "Production tasks must be created through Orders → Blueprint.",
  });
};

/* ── Accept Task ── */
exports.acceptTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = parseInt(req.user.id);

    // ── FIXED: Switched to .query and parsed IDs ──
    const [tasks] = await db.query(
      `SELECT pt.*, o.order_number
       FROM project_tasks pt
       LEFT JOIN orders o ON o.id = pt.order_id
       WHERE pt.id = ? AND pt.assigned_to = ?`,
      [taskId, userId],
    );

    if (tasks.length === 0) {
      return res.status(400).json({ message: "Task not found." });
    }
    const task = tasks[0];

    if (normalize(task.status) !== "pending") {
      return res
        .status(400)
        .json({ message: "Task already accepted or blocked." });
    }

    const sequenceError = await validateProductionSequence({
      orderId: task.order_id,
      taskRole: task.task_role,
      currentStatus: "pending",
      nextStatus: "in_progress",
    });

    if (sequenceError) {
      return res.status(400).json({ message: sequenceError });
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `UPDATE project_tasks SET status = 'in_progress', is_read = 1, accepted_at = NOW() 
       WHERE id = ? AND assigned_to = ? AND status = 'pending'`,
      [taskId, userId],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task status or assignment changed before this update was completed. Refresh and try again.",
      });
    }

    // Best-effort: task acceptance above has already committed under
    // autocommit. A notification failure here must never be reported
    // to the staff member as a failed task acceptance.
    await createNotificationSafe(db, {
      userId: parseInt(task.assigned_by),
      type: "task_update",
      title: "Task Started",
      message: task.order_number
        ? `${req.user.name || "A staff member"} started ${task.task_role || task.title} for Order ${task.order_number}.`
        : `${req.user.name || "A staff member"} started ${task.task_role || task.title}.`,
      targetType: "task",
      targetId: task.id,
      targetOrderId: task.order_id,
    });

    res.json({ message: "Assignment accepted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error accepting task" });
  }
};

/* ── Update Task Status ── */
exports.updateTaskStatus = async (req, res) => {
  const { status } = req.body;
  const taskId = parseInt(req.params.id);
  const holdReason = String(req.body?.hold_reason || "").trim();

  const validStatuses = ["pending", "in_progress", "completed", "blocked"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  if (status === "blocked") {
    if (!holdReason) {
      return res.status(400).json({
        message: "A reason is required before putting production work on hold.",
      });
    }
    if (holdReason.length > 500) {
      return res.status(400).json({
        message: "Hold reason must be 500 characters or fewer.",
      });
    }
  }

  try {
    const [rows] = await db.query(
      `SELECT pt.id, pt.title, pt.status, pt.assigned_to, pt.assigned_by,
              pt.accepted_at, pt.completed_at, pt.order_id, pt.task_role,
              o.order_number
       FROM project_tasks pt
       LEFT JOIN orders o ON o.id = pt.order_id
       WHERE pt.id = ?
       LIMIT 1`,
      [taskId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found." });
    }

    const existing = rows[0];
    const isAdmin = req.user.role === "admin";
    const isOwner = Number(existing.assigned_to) === Number(req.user.id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        message: "You can only update tasks assigned to you.",
      });
    }

    if (status === existing.status) {
      return res.json({ message: "No changes were made." });
    }

    if (existing.status === "completed" && status !== "completed") {
      return res.status(400).json({
        message: "Completed tasks can no longer be changed.",
      });
    }

    if (!isAdmin && status === "pending") {
      return res.status(400).json({
        message: "Staff cannot move a task back to pending.",
      });
    }

    const sequenceError = await validateProductionSequence({
      orderId: existing.order_id,
      taskRole: existing.task_role,
      currentStatus: existing.status,
      nextStatus: status,
    });

    if (sequenceError) {
      return res.status(400).json({ message: sequenceError });
    }

    let completedAt = existing.completed_at || null;

    if (status === "completed" && existing.status !== "completed") {
      completedAt = new Date();
    } else if (status !== "completed") {
      completedAt = null;
    }

    let nextAcceptedAt = existing.accepted_at || null;
    if (!nextAcceptedAt && status === "in_progress") {
      nextAcceptedAt = new Date();
    }

    const [result] = await db.query(
      `UPDATE project_tasks
       SET status = ?, completed_at = ?, accepted_at = ?, is_read = 1, updated_at = NOW()
       WHERE id = ? AND status = ? AND assigned_to = ?`,
      [
        status,
        completedAt,
        nextAcceptedAt,
        taskId,
        existing.status,
        existing.assigned_to,
      ],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task status or assignment changed before this update was completed. Refresh and try again.",
      });
    }

    const acceptedAtChanged =
      (existing.accepted_at ? new Date(existing.accepted_at).getTime() : null) !==
      (nextAcceptedAt ? new Date(nextAcceptedAt).getTime() : null);
    const completedAtChanged =
      (existing.completed_at ? new Date(existing.completed_at).getTime() : null) !==
      (completedAt ? new Date(completedAt).getTime() : null);

    req.auditRecord = {
      id: taskId,
      old: {
        status: existing.status,
        accepted_at: existing.accepted_at,
        completed_at: existing.completed_at,
      },
      new: {
        status,
        accepted_at: nextAcceptedAt,
        completed_at: completedAt,
        ...(status === "blocked" ? { hold_reason: holdReason } : {}),
        changed_fields: [
          "status",
          acceptedAtChanged && "accepted_at",
          completedAtChanged && "completed_at",
          status === "blocked" && "hold_reason",
        ].filter(Boolean),
      },
    };

    if (existing.assigned_by && status !== "blocked") {
      const statusTitle =
        status === "in_progress"
          ? existing.status === "blocked"
            ? "Production Work Resumed"
            : "Task Started"
          : status === "completed"
            ? "Task Completed"
            : "Task Returned to Pending";
      const orderLabel = existing.order_number
        ? `Order ${existing.order_number}`
        : existing.order_id
          ? `Order #${existing.order_id}`
          : "this project";

      await createNotificationSafe(db, {
        userId: parseInt(existing.assigned_by),
        type: "task_update",
        title: statusTitle,
        message: `${req.user.name || "A staff member"} ${
          status === "completed"
            ? "completed"
            : status === "in_progress"
              ? existing.status === "blocked"
                ? "resumed"
                : "started"
              : "returned"
        } ${existing.task_role || existing.title} for ${orderLabel}.`,
        targetType: "task",
        targetId: existing.id,
        targetOrderId: existing.order_id,
      });
    }

    let becameProductionReady = false;

    try {
      if (existing.order_id && existing.assigned_by) {
        const [packetRows] = await db.query(
          `SELECT id, task_role, status
           FROM project_tasks
           WHERE order_id = ?`,
          [parseInt(existing.order_id)],
        );

        const isFullyReady = (rows) => {
          const stepKeys = new Set(
            rows.map((row) => normalize(row.task_role)).filter(Boolean),
          );
          const completedStepKeys = new Set(
            rows
              .filter((row) => normalize(row.status) === "completed")
              .map((row) => normalize(row.task_role))
              .filter(Boolean),
          );
          const missingSteps = REQUIRED_PRODUCTION_STEP_KEYS.filter(
            (step) => !stepKeys.has(step),
          );
          const incompleteSteps = REQUIRED_PRODUCTION_STEP_KEYS.filter(
            (step) => !completedStepKeys.has(step),
          );
          return missingSteps.length === 0 && incompleteSteps.length === 0;
        };

        const rowsBeforeThisRequest = packetRows.map((row) =>
          Number(row.id) === taskId
            ? { ...row, status: existing.status }
            : row,
        );

        const wasProductionReadyBefore = isFullyReady(rowsBeforeThisRequest);
        const isProductionReadyAfter = isFullyReady(packetRows);

        becameProductionReady =
          !wasProductionReadyBefore && isProductionReadyAfter;

        if (status === "blocked") {
          await createNotificationSafe(db, {
            userId: parseInt(existing.assigned_by),
            type: "task_blocked",
            title: "Production Work Put on Hold",
            message: `${req.user.name || "A staff member"} put ${existing.task_role} on hold for ${
              existing.order_number
                ? `Order ${existing.order_number}`
                : `Order #${existing.order_id}`
            }. Reason: ${holdReason}`,
            targetType: "task",
            targetId: existing.id,
            targetOrderId: existing.order_id,
          });
        }

        if (becameProductionReady) {
          await createNotificationSafe(db, {
            userId: parseInt(existing.assigned_by),
            type: "production_ready",
            title: "Production Ready for Shipping",
            message: `The full production workflow for ${
              existing.order_number
                ? `Order ${existing.order_number}`
                : `Order #${existing.order_id}`
            } is complete. Review the order before scheduling delivery.`,
            targetType: "order",
            targetId: existing.order_id,
            targetOrderId: existing.order_id,
          });
        }
      }
    } catch (readinessErr) {
      console.error(
        "[pos.tasks updateTaskStatus readiness]",
        readinessErr.message,
      );
    }

    if (becameProductionReady) {
      try {
        await db.query(
          `INSERT INTO audit_logs
             (user_id, action, table_name, record_id, old_values, new_values, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            "mark_production_ready_for_shipping",
            "orders",
            parseInt(existing.order_id),
            JSON.stringify({ ready_for_shipping: false }),
            JSON.stringify({
              ready_for_shipping: true,
              completed_required_steps: REQUIRED_PRODUCTION_STEP_KEYS.length,
            }),
            req.ip || null,
          ],
        );
      } catch (auditErr) {
        console.error(
          "[pos.tasks] readiness audit insert failed:",
          auditErr.message,
        );
      }
    }

    const responseMessage =
      status === "blocked"
        ? "Production step put on hold."
        : status === "in_progress" && existing.status === "blocked"
          ? "Production step resumed."
          : "Task status updated successfully.";

    res.json({
      message: responseMessage,
      task: {
        id: taskId,
        status,
        accepted_at: nextAcceptedAt,
        completed_at: completedAt,
        hold_reason: status === "blocked" ? holdReason : null,
      },
    });
  } catch (err) {
    console.error("[pos.tasks PUT /:id/status]", err);
    res.status(500).json({ message: "Server error." });
  }
};

/* ── Update Task (Admin edit / Staff status update fallback) ── */
exports.updateTask = async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    order_id,
    blueprint_id,
    assigned_to,
    task_role,
    title,
    description,
    due_date,
    status,
  } = req.body;

  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(`SELECT * FROM project_tasks WHERE id = ?`, [
      id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found." });
    }

    const existing = rows[0];

    if (req.user.role !== "admin") {
      const triedToEditProtectedFields = [
        order_id,
        blueprint_id,
        assigned_to,
        task_role,
        title,
        description,
        due_date,
      ].some((value) => value !== undefined);

      if (triedToEditProtectedFields) {
        return res.status(403).json({
          message: "Staff can only update the status of their own task.",
        });
      }

      req.body = { status: status ?? existing.status };
      return exports.updateTaskStatus(req, res);
    }

    if (REQUIRED_PRODUCTION_STEP_KEYS.includes(normalize(existing.task_role))) {
      return res.status(400).json({
        message:
          "Production tasks must be managed through Orders → Blueprint and the Production Work Queue.",
      });
    }

    const validStatuses = ["pending", "in_progress", "completed", "blocked"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const parseStrictPositiveInt = (value) => {
      if (typeof value === "number") {
        return Number.isSafeInteger(value) && value > 0 ? value : null;
      }
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!/^\d+$/.test(trimmed)) return null;
      const parsed = Number(trimmed);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    };

    const parseOptionalId = (value, existingValue) => {
      if (value === undefined) return { value: existingValue, valid: true };
      if (value === null || value === "") return { value: null, valid: true };
      const parsed = parseStrictPositiveInt(value);
      return parsed === null
        ? { value: null, valid: false }
        : { value: parsed, valid: true };
    };

    const nextAssignedTo = parseStrictPositiveInt(assigned_to);
    if (!nextAssignedTo) {
      return res.status(400).json({
        message: "Assign To is required and must be a valid staff ID.",
      });
    }

    const orderIdResult = parseOptionalId(order_id, existing.order_id);
    if (!orderIdResult.valid) {
      return res.status(400).json({ message: "Invalid order reference." });
    }
    const nextOrderId = orderIdResult.value;

    const blueprintIdResult = parseOptionalId(
      blueprint_id,
      existing.blueprint_id,
    );
    if (!blueprintIdResult.valid) {
      return res.status(400).json({ message: "Invalid blueprint reference." });
    }
    const nextBlueprintId = blueprintIdResult.value;

    const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
    const parsePhilippineDateTimeLocal = (value) => {
      if (typeof value !== "string") return undefined;
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
      if (!match) return undefined;
      const [, yStr, moStr, dStr, hStr, miStr] = match;
      const y = Number(yStr),
        mo = Number(moStr),
        d = Number(dStr),
        h = Number(hStr),
        mi = Number(miStr);
      const utcMs = Date.UTC(y, mo - 1, d, h, mi) - PH_OFFSET_MS;
      const result = new Date(utcMs);
      const check = new Date(utcMs + PH_OFFSET_MS);
      if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== d ||
        check.getUTCHours() !== h ||
        check.getUTCMinutes() !== mi
      ) {
        return undefined;
      }
      return result;
    };

    let nextDueDate;
    if (due_date === undefined) {
      nextDueDate = existing.due_date;
    } else if (due_date === "" || due_date === null) {
      nextDueDate = null;
    } else {
      nextDueDate = parsePhilippineDateTimeLocal(due_date);
      if (nextDueDate === undefined) {
        return res.status(400).json({ message: "Invalid due date." });
      }
    }

    const nextTaskRole = task_role ?? existing.task_role;
    const nextTitle = title ?? existing.title;
    const nextDescription = description ?? existing.description;
    const nextStatus = status ?? existing.status;

    const existingDueMinute = existing.due_date
      ? Math.floor(new Date(existing.due_date).getTime() / 60000)
      : null;
    const nextDueMinute = nextDueDate
      ? Math.floor(nextDueDate.getTime() / 60000)
      : null;

    const orderIdChanged = existing.order_id !== nextOrderId;
    const blueprintIdChanged = existing.blueprint_id !== nextBlueprintId;
    const assignedToChanged = existing.assigned_to !== nextAssignedTo;
    const taskRoleChanged = existing.task_role !== nextTaskRole;
    const titleChanged = existing.title !== nextTitle;
    const descriptionChanged =
      (existing.description ?? "") !== (nextDescription ?? "");
    const dueDateChanged = existingDueMinute !== nextDueMinute;
    const statusChanged = existing.status !== nextStatus;

    const anyFieldChanged =
      orderIdChanged ||
      blueprintIdChanged ||
      assignedToChanged ||
      taskRoleChanged ||
      titleChanged ||
      descriptionChanged ||
      dueDateChanged ||
      statusChanged;

    if (!anyFieldChanged) {
      return res.json({ message: "No changes were made." });
    }

    const descriptionForUpdate = descriptionChanged
      ? nextDescription
      : existing.description;
    const dueDateForUpdate = dueDateChanged ? nextDueDate : existing.due_date;

    const assignee = await ensureIndoorAssignee(nextAssignedTo);
    if (!assignee) {
      return res.status(400).json({
        message: "Only active indoor staff can be assigned to project tasks.",
      });
    }

    if (nextOrderId) {
      const [[orderExists]] = await db.query(
        `SELECT id FROM orders WHERE id = ? LIMIT 1`,
        [nextOrderId],
      );
      if (!orderExists) {
        return res.status(400).json({ message: "Linked order not found." });
      }
    }

    if (nextBlueprintId) {
      const [[blueprintExists]] = await db.query(
        `SELECT id FROM blueprints WHERE id = ? LIMIT 1`,
        [nextBlueprintId],
      );
      if (!blueprintExists) {
        return res
          .status(400)
          .json({ message: "Linked blueprint not found." });
      }
    }

    if (existing.status === "completed" && nextStatus !== "completed") {
      return res.status(400).json({
        message: "Completed tasks can no longer be changed.",
      });
    }

    const normalizedExistingRole = normalize(existing.task_role);
    const normalizedNextRole = normalize(nextTaskRole);
    const existingHasRequiredRole = REQUIRED_PRODUCTION_STEP_KEYS.includes(
      normalizedExistingRole,
    );
    const nextHasRequiredRole = REQUIRED_PRODUCTION_STEP_KEYS.includes(
      normalizedNextRole,
    );

    if (nextHasRequiredRole && !nextOrderId) {
      return res.status(400).json({
        message: "A required production step must be linked to an order.",
      });
    }

    if (
      (orderIdChanged || taskRoleChanged) &&
      (existingHasRequiredRole || nextHasRequiredRole)
    ) {
      return res.status(400).json({
        message:
          "Production workflow order and step role must be managed through the production assignment workflow.",
      });
    }

    if (statusChanged) {
      const sequenceError = await validateProductionSequence({
        orderId: nextOrderId,
        taskRole: nextTaskRole,
        currentStatus: existing.status,
        nextStatus,
      });

      if (sequenceError) {
        return res.status(400).json({ message: sequenceError });
      }
    }

    let completedAt = existing.completed_at;
    if (nextStatus === "completed" && existing.status !== "completed") {
      completedAt = new Date();
    } else if (nextStatus !== "completed") {
      completedAt = null;
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `UPDATE project_tasks
       SET order_id = ?, blueprint_id = ?, assigned_to = ?, task_role = ?,
           title = ?, description = ?, due_date = ?, status = ?, completed_at = ?, updated_at = NOW()
       WHERE id = ?
         AND order_id <=> ? AND blueprint_id <=> ? AND assigned_to <=> ?
         AND CAST(task_role AS BINARY) <=> CAST(? AS BINARY)
         AND CAST(title AS BINARY) <=> CAST(? AS BINARY)
         AND CAST(description AS BINARY) <=> CAST(? AS BINARY)
         AND due_date <=> ? AND status <=> ?`,
      [
        nextOrderId,
        nextBlueprintId,
        nextAssignedTo,
        nextTaskRole,
        nextTitle,
        descriptionForUpdate,
        dueDateForUpdate,
        nextStatus,
        completedAt,
        id,
        existing.order_id,
        existing.blueprint_id,
        existing.assigned_to,
        existing.task_role,
        existing.title,
        existing.description,
        existing.due_date,
        existing.status,
      ],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task was changed before this update was completed. Refresh and try again.",
      });
    }

    const existingCompletedAtTime = existing.completed_at
      ? new Date(existing.completed_at).getTime()
      : null;
    const nextCompletedAtTime = completedAt
      ? new Date(completedAt).getTime()
      : null;
    const completedAtChanged = existingCompletedAtTime !== nextCompletedAtTime;

    const changedFields = [
      orderIdChanged && "order_id",
      blueprintIdChanged && "blueprint_id",
      assignedToChanged && "assigned_to",
      taskRoleChanged && "task_role",
      titleChanged && "title",
      descriptionChanged && "description",
      dueDateChanged && "due_date",
      statusChanged && "status",
      completedAtChanged && "completed_at",
    ].filter(Boolean);

    req.auditRecord = {
      id: id,
      old: {
        order_id: existing.order_id,
        blueprint_id: existing.blueprint_id,
        assigned_to: existing.assigned_to,
        task_role: existing.task_role,
        title: existing.title,
        description: existing.description,
        due_date: existing.due_date,
        status: existing.status,
        completed_at: existing.completed_at,
      },
      new: {
        order_id: nextOrderId,
        blueprint_id: nextBlueprintId,
        assigned_to: nextAssignedTo,
        task_role: nextTaskRole,
        title: nextTitle,
        description: descriptionForUpdate,
        due_date: dueDateForUpdate,
        status: nextStatus,
        completed_at: completedAt,
        changed_fields: changedFields,
      },
    };

    if (assignedToChanged) {
      await createNotificationSafe(db, {
        userId: nextAssignedTo,
        type: "assignment",
        title: "Task Updated",
        message: `A task has been assigned/updated: ${nextTitle}`,
        targetType: "task",
        targetId: taskId,
        targetOrderId: nextOrderId,
      });
    }

    res.json({ message: "Task updated successfully." });
  } catch (err) {
    console.error("[pos.tasks PUT /:id]", err);
    res.status(500).json({ message: "Server error." });
  }
};

exports.deleteTask = async (req, res) => {
  const parseStrictPositiveInt = (value) => {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can delete tasks." });
  }

  const taskId = parseStrictPositiveInt(req.params.id);
  if (!taskId) {
    return res.status(400).json({ message: "Invalid task ID." });
  }

  let conn = null;
  let transactionActive = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[task]] = await conn.query(
      `SELECT id, order_id, blueprint_id, assigned_to, assigned_by, task_role,
              title, description, accepted_at, status, is_read, due_date,
              completed_at, created_at, updated_at
       FROM project_tasks
       WHERE id = ?
       FOR UPDATE`,
      [taskId],
    );

    if (!task) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Task not found." });
    }

    if (REQUIRED_PRODUCTION_STEP_KEYS.includes(normalize(task.task_role))) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Required production tasks cannot be deleted.",
      });
    }

    const [result] = await conn.query(
      `DELETE FROM project_tasks WHERE id = ?`,
      [taskId],
    );

    if (result.affectedRows !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({
        message: "Task was already deleted or changed. Refresh and try again.",
      });
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: taskId,
      old: {
        order_id: task.order_id,
        blueprint_id: task.blueprint_id,
        assigned_to: task.assigned_to,
        assigned_by: task.assigned_by,
        task_role: task.task_role,
        title: task.title,
        description: task.description,
        accepted_at: task.accepted_at,
        status: task.status,
        is_read: task.is_read,
        due_date: task.due_date,
        completed_at: task.completed_at,
        created_at: task.created_at,
        updated_at: task.updated_at,
      },
      new: null,
    };

    res.json({ message: "Task deleted successfully." });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch (_) {
        // do not hide the original error
      }
    }
    console.error("[pos.tasks DELETE /:id]", err);
    return res.status(500).json({ message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};
