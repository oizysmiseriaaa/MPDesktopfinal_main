"use strict";
"use server";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirebaseAdmin = getFirebaseAdmin;
const fs = require("fs");
const path = require("path");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
let adminApp = null;
function resolveServiceAccount() {
  const serviceAccountString = process.env.SERVICE_ACCOUNT_KEY;
  if (serviceAccountString && String(serviceAccountString).trim()) {
    return {
      account: JSON.parse(serviceAccountString),
      source: "SERVICE_ACCOUNT_KEY",
    };
  }
  const credentialFileEnvKeys = [
    "GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE",
    "SERVICE_ACCOUNT_FILE",
  ];
  for (const envKey of credentialFileEnvKeys) {
    const filePath = process.env[envKey];
    if (!filePath || !String(filePath).trim()) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      continue;
    }
    const raw = fs.readFileSync(resolved, "utf8");
    return { account: JSON.parse(raw), source: `file:${resolved}` };
  }
  const defaultCandidates = [
    path.resolve(__dirname, "..", "..", "service-account.json"),
  ];
  // Pick up any freshly rotated key, but always skip the known-compromised
  // credential that was accidentally committed in git history.
  const compromisedKeyFileName =
    "unified-booker-firebase-adminsdk-fbsvc-c376d2b0e6.json";
  const functionsDir = path.resolve(__dirname, "..", "..");
  try {
    for (const fileName of fs.readdirSync(functionsDir)) {
      if (
        fileName.startsWith("unified-booker-firebase-adminsdk-") &&
        fileName.endsWith(".json") &&
        fileName !== compromisedKeyFileName
      ) {
        defaultCandidates.push(path.resolve(functionsDir, fileName));
      }
    }
  } catch {
    // Ignore discovery errors; fall through to the thrown error below if nothing resolves.
  }
  for (const candidatePath of defaultCandidates) {
    if (!fs.existsSync(candidatePath)) continue;
    const raw = fs.readFileSync(candidatePath, "utf8");
    return { account: JSON.parse(raw), source: `file:${candidatePath}` };
  }
  throw new Error(
    "No Firebase service account credential is available. Configure SERVICE_ACCOUNT_KEY or point GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE to a local service-account JSON file.",
  );
}
function getFirebaseAdmin() {
  if (!adminApp) {
    const { account, source } = resolveServiceAccount();
    adminApp = firebase_admin_1.default.initializeApp({
      credential: firebase_admin_1.default.credential.cert(account),
    });
    console.log(`Firebase Admin initialized with ${source}.`);
  }
  return {
    adminApp,
    adminDb: adminApp.firestore(),
    adminAuth: adminApp.auth(),
  };
}
//# sourceMappingURL=firebase-admin.js.map
