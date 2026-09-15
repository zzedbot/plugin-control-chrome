import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { dataDirectory, HOST_NAME } from "../src/runtime-paths.mjs";

const execFileAsync = promisify(execFile);
if (process.platform === "win32") {
  await execFileAsync("reg", ["delete", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`, "/f"], { windowsHide: true }).catch(() => {});
  await fs.rm(path.join(dataDirectory(), `${HOST_NAME}.json`), { force: true });
} else {
  const manifestDir = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
    : path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts");
  await fs.rm(path.join(manifestDir, `${HOST_NAME}.json`), { force: true });
}
await fs.rm(path.join(dataDirectory(), "bin"), { recursive: true, force: true });
await fs.rm(path.join(dataDirectory(), "runtime"), { recursive: true, force: true });
process.stdout.write("Removed the Lingee Chrome Agent Bridge native host and runtime descriptors. Policy settings were preserved.\n");
