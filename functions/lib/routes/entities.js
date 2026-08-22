"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.entitiesRouter = void 0;
const express_1 = __importDefault(require("express"));
const route_helpers_1 = require("../lib/route-helpers");
// ponytail: Group agents, investors, reminders, and notifications together.
exports.entitiesRouter = express_1.default.Router();
exports.entitiesRouter.use(route_helpers_1.authenticate);
exports.entitiesRouter.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  return (0, route_helpers_1.requireOperationsStaff)(req, res, next);
});
exports.entitiesRouter.get("/agents", async (req, res) => {
  try {
    const agents = await (0, route_helpers_1.getCollection)("agents");
    return res.status(200).json(agents);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch agents" });
  }
});
exports.entitiesRouter.post("/agent", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newAgent = req.body;
    const docRef = await adminDb.collection("agents").add(newAgent);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create agent" });
  }
});
exports.entitiesRouter.put("/agent/:agentId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const agentData = req.body;
    await adminDb
      .collection("agents")
      .doc(req.params.agentId)
      .update(agentData);
    return res.status(200).json({ message: "Agent updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update agent" });
  }
});
exports.entitiesRouter.delete("/agent/:agentId", async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const adminDb = (0, route_helpers_1.getDb)();
    await adminDb.collection("agents").doc(agentId).delete();
    return res.status(200).json({ message: "Agent deleted successfully" });
  } catch (err) {
    console.error("DELETE agent failed:", err);
    return res.status(500).json({ error: "Failed to delete agent" });
  }
});
exports.entitiesRouter.get("/investors", async (req, res) => {
  try {
    const investors = await (0, route_helpers_1.getCollection)("investors");
    return res.status(200).json(investors);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch investors" });
  }
});
exports.entitiesRouter.post("/investor", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newInvestor = req.body;
    const docRef = await adminDb.collection("investors").add(newInvestor);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create investor" });
  }
});
exports.entitiesRouter.put("/investor/:investorId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const investorData = req.body;
    await adminDb
      .collection("investors")
      .doc(req.params.investorId)
      .update(investorData);
    return res.status(200).json({ message: "Investor updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update investor" });
  }
});
exports.entitiesRouter.delete("/investor/:investorId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    await adminDb.collection("investors").doc(req.params.investorId).delete();
    return res.status(200).json({ message: "Investor deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete investor" });
  }
});
exports.entitiesRouter.get("/reminders", async (req, res) => {
  try {
    const reminders = await (0, route_helpers_1.getCollection)("reminders");
    return res.status(200).json(reminders);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch reminders" });
  }
});
exports.entitiesRouter.post("/reminder", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newReminder = req.body;
    const requestedId = String(newReminder?.id || "").trim();
    if (requestedId) {
      const ref = adminDb.collection("reminders").doc(requestedId);
      try {
        await ref.create({ ...newReminder, id: requestedId });
        return res.status(201).json({ id: requestedId, created: true });
      } catch (error) {
        if (error?.code === 6 || error?.code === "already-exists") {
          return res
            .status(200)
            .json({ id: requestedId, created: false, existing: true });
        }
        throw error;
      }
    }
    const docRef = await adminDb.collection("reminders").add(newReminder);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create reminder" });
  }
});
exports.entitiesRouter.put("/reminder/:reminderId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const reminderData = req.body;
    await adminDb
      .collection("reminders")
      .doc(req.params.reminderId)
      .update(reminderData);
    return res.status(200).json({ message: "Reminder updated successfully" });
  } catch (err) {
    console.error("Failed to update reminder:", err);
    const message = err?.message || "Failed to update reminder";
    return res.status(500).json({ error: message });
  }
});
exports.entitiesRouter.delete("/reminder/:reminderId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    await adminDb.collection("reminders").doc(req.params.reminderId).delete();
    return res.status(200).json({ message: "Reminder deleted successfully" });
  } catch (err) {
    console.error("Failed to delete reminder:", err);
    const message = err?.message || "Failed to delete reminder";
    return res.status(500).json({ error: message });
  }
});
exports.entitiesRouter.get("/housekeeping", async (req, res) => {
  try {
    const housekeeping = await (0, route_helpers_1.getCollection)(
      "housekeeping",
    );
    return res.status(200).json(housekeeping);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to fetch housekeeping tasks" });
  }
});
exports.entitiesRouter.post("/housekeeping", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newTask = req.body;
    const requestedId = String(newTask?.id || "").trim();
    if (requestedId) {
      const ref = adminDb.collection("housekeeping").doc(requestedId);
      try {
        await ref.create({ ...newTask, id: requestedId });
        return res.status(201).json({ id: requestedId, created: true });
      } catch (error) {
        if (error?.code === 6 || error?.code === "already-exists") {
          return res
            .status(200)
            .json({ id: requestedId, created: false, existing: true });
        }
        throw error;
      }
    }
    const docRef = await adminDb.collection("housekeeping").add(newTask);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to create housekeeping task" });
  }
});
exports.entitiesRouter.put(
  "/housekeeping/:housekeepingId",
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const taskData = req.body;
      await adminDb
        .collection("housekeeping")
        .doc(req.params.housekeepingId)
        .update(taskData);
      return res
        .status(200)
        .json({ message: "Housekeeping task updated successfully" });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Failed to update housekeeping task" });
    }
  },
);
exports.entitiesRouter.get("/notifications/:userId", async (req, res) => {
  try {
    if (String(req.params.userId) !== String(req.user?.uid || "")) {
      return res
        .status(403)
        .json({ error: "Cannot access another user's notifications" });
    }
    const adminDb = (0, route_helpers_1.getDb)();
    const snapshot = await adminDb
      .collection("notifications")
      .where("userId", "==", req.params.userId)
      .get();
    const notifications = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt || new Date().toISOString(),
    }));
    return res
      .status(200)
      .json(
        notifications.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});
exports.entitiesRouter.post("/notification", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newNotification = req.body;
    const docRef = await adminDb
      .collection("notifications")
      .add(newNotification);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create notification" });
  }
});
exports.entitiesRouter.put(
  "/notification/:notificationId/read",
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const ref = adminDb
        .collection("notifications")
        .doc(req.params.notificationId);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: "Notification not found" });
      }
      if (
        String(snapshot.data()?.userId || "") !== String(req.user?.uid || "")
      ) {
        return res
          .status(403)
          .json({ error: "Cannot modify another user's notification" });
      }
      await ref.update({ isRead: true });
      return res.status(200).json({ message: "Notification marked as read" });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Failed to mark notification as read" });
    }
  },
);
exports.entitiesRouter.post(
  "/notifications/:userId/mark-all-read",
  async (req, res) => {
    try {
      if (String(req.params.userId) !== String(req.user?.uid || "")) {
        return res
          .status(403)
          .json({ error: "Cannot modify another user's notifications" });
      }
      const adminDb = (0, route_helpers_1.getDb)();
      const snapshot = await adminDb
        .collection("notifications")
        .where("userId", "==", req.params.userId)
        .where("isRead", "==", false)
        .get();
      const batch = adminDb.batch();
      snapshot.docs.forEach((doc) => batch.update(doc.ref, { isRead: true }));
      await batch.commit();
      return res
        .status(200)
        .json({ message: "All notifications marked as read" });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Failed to mark all notifications as read" });
    }
  },
);
exports.entitiesRouter.delete(
  "/notification/:notificationId",
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const ref = adminDb
        .collection("notifications")
        .doc(req.params.notificationId);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: "Notification not found" });
      }
      if (
        String(snapshot.data()?.userId || "") !== String(req.user?.uid || "")
      ) {
        return res
          .status(403)
          .json({ error: "Cannot delete another user's notification" });
      }
      await ref.delete();
      return res
        .status(200)
        .json({ message: "Notification deleted successfully" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to delete notification" });
    }
  },
);
//# sourceMappingURL=entities.js.map
