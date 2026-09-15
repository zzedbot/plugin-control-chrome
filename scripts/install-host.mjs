import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { dataDirectory, HOST_NAME } from "../src/runtime-paths.mjs";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
if (!args.extensionId) {
  process.stderr.write("Usage: npm run install:host -- --extension-id <id>\nLoad extension/ as an unpacked extension first, then copy its ID from chrome://extensions.\n");
  process.exit(2);
}
if (!/^[a-p]{32}$/.test(args.extensionId)) throw new Error("extension-id must be a 32-character Chrome extension ID");

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "dist", process.platform === "win32" ? "universal-browser-host.exe" : "universal-browser-host");
const installDir = path.join(dataDirectory(), "bin");
// Keep a running host untouched; Chrome picks up the new path on its next connection.
const digest = createHash("sha256").update(await fs.readFile(source)).digest("hex").slice(0, 16);
const parsedSource = path.parse(source);
const target = path.join(installDir, `${parsedSource.name}-${digest}${parsedSource.ext}`);
await fs.mkdir(installDir, { recursive: true });
try {
  await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const existingDigest = createHash("sha256").update(await fs.readFile(target)).digest("hex");
  const sourceDigest = createHash("sha256").update(await fs.readFile(source)).digest("hex");
  if (existingDigest !== sourceDigest) throw new Error("Installed host hash does not match the build");
}
if (process.platform !== "win32") await fs.chmod(target, 0o755);

const manifest = {
  name: HOST_NAME,
  description: "Lingee Chrome Agent Bridge native messaging host",
  path: target,
  type: "stdio",
  allowed_origins: [`chrome-extension://${args.extensionId}/`]
};
const manifestPath = await installManifest(manifest);
process.stdout.write(`Installed native host.\nManifest: ${manifestPath}\nExecutable: ${target}\nExtension ID: ${args.extensionId}\nRestart Chrome to connect.\n`);

async function installManifest(manifest) {
  if (process.platform === "win32") {
    const manifestPath = path.join(dataDirectory(), `${HOST_NAME}.json`);
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await execFileAsync("reg", ["add", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { windowsHide: true });
    return manifestPath;
  }
  const manifestDir = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
    : path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts");
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, `${HOST_NAME}.json`);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--extension-id") result.extensionId = values[++index];
  }
  return result;
}
