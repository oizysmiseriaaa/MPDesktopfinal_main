const fs = require("fs");
const path = require("path");

const SERVICE_ACCOUNT = path.resolve(
  __dirname,
  "..",
  "functions",
  "unified-booker-firebase-adminsdk-fbsvc-c376d2b0e6.json",
);

const CUTOFF = "2026-08-01"; // keep reminders dated >= this

function exitWithError(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function normalizeDateString(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return "";
}

function resolveReminderDate(reminder) {
  if (!reminder) return "";
  // dueDate is the operational calendar date used by the app.
  const due = normalizeDateString(reminder.dueDate || reminder.date);
  if (due) return due;
  // Fall back to creation date (ISO) if present.
  const created = normalizeDateString(reminder.createdAt || reminder.updatedAt);
  return created || "";
}

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    exitWithError(`Service account not found at ${SERVICE_ACCOUNT}`);
  }

  // eslint-disable-next-line global-require
  const admin = require(
    path.resolve(__dirname, "..", "functions", "node_modules", "firebase-admin"),
  );
  if (admin.apps.length === 0) {
    const account = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(account) });
  }
  const db = admin.firestore();
  const { projectId } = admin.app().options;
  console.log(`Connected to project: ${projectId}`);

  const execute = process.argv.includes("--execute");

  console.log("Reading reminders collection...");
  const snapshot = await db.collection("reminders").get();
  if (snapshot.empty) {
    console.log("No reminders found. Nothing to do.");
    return;
  }

  const toDelete = [];
  const kept = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const date = resolveReminderDate(data);
    if (date && date < CUTOFF) {
      toDelete.push({
        id: doc.id,
        date,
        title: String(data.title || data.description || "").slice(0, 80),
        bookingId: String(data.bookingId || ""),
        dueDate: String(data.dueDate || ""),
        createdAt: String(data.createdAt || ""),
      });
    } else {
      kept.push({ id: doc.id, date: date || "(none)" });
    }
  });

  toDelete.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  console.log("");
  console.log(`Total reminders: ${snapshot.size}`);
  console.log(`  Jan–July (before ${CUTOFF})  : ${toDelete.length}`);
  console.log(`  Kept (Aug 2026 or later)   : ${kept.length}`);
  console.log("");

  if (toDelete.length > 0) {
    console.log("Reminders to DELETE (preview up to 40):");
    toDelete.slice(0, 40).forEach((r) => {
      console.log(`  ${r.date}  ${r.id}  ${r.title || "(no title)"}${r.bookingId ? ` [booking ${r.bookingId}]` : ""}`);
    });
    if (toDelete.length > 40) {
      console.log(`  ...and ${toDelete.length - 40} more`);
    }
    console.log("");
  }

  if (kept.length > 0) {
    console.log("Kept reminders (displaying up to 20):");
    kept.slice(0, 20).forEach((r) => {
      console.log(`  ${r.date}  ${r.id}`);
    });
    if (kept.length > 20) {
      console.log(`  ...and ${kept.length - 20} more`);
    }
    console.log("");
  }

  if (!execute) {
    console.log("DRY RUN — no writes performed.");
    console.log("To delete these Jan–July reminders, rerun with: --execute");
    console.log("Manifest of would-be-deleted ids:");
    console.log(JSON.stringify(toDelete.map((r) => r.id), null, 2));
    return;
  }

  console.log(`Executing deletion of ${toDelete.length} Jan–July reminders...`);
  let deleted = 0;
  const manifest = [];
  for (const item of toDelete) {
    try {
      await db.collection("reminders").doc(item.id).delete();
      deleted += 1;
      manifest.push(item.id);
    } catch (error) {
      console.error(`Failed to delete ${item.id}:`, error?.message || error);
    }
  }

  console.log("");
  console.log("--- Cleanup complete ---");
  console.log(`Deleted: ${deleted}`);
  console.log(`Kept (Aug 2026 or later): ${kept.length}`);
  console.log("Deleted id manifest:");
  console.log(JSON.stringify(manifest, null, 2));

  if (deleted !== toDelete.length) {
    exitWithError("Some deletions failed. Review the errors above.");
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
