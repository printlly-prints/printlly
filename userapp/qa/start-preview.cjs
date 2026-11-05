// Runs the real Expo application against the loopback, in-memory fixture API.
// It does not edit .env files or connect to production services.
const { spawn } = require("node:child_process");
const path = require("node:path");
const expoCli = path.join(path.dirname(require.resolve("expo/package.json")), "bin", "cli");
const child = spawn(process.execPath, ["--use-system-ca", "--dns-result-order=ipv4first", expoCli, "start", "--web", "--localhost", "--port", "8082", ...(process.argv.includes("--clear") ? ["--clear"] : [])], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:8083", EXPO_PUBLIC_POSTHOG_KEY: "" },
  stdio: "inherit",
});
child.on("exit", (code) => { process.exitCode = code || 0; });
