import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const bundle = path.join(dist, "native-host.cjs");
const blob = path.join(dist, "native-host.blob");
const executable = path.join(dist, process.platform === "win32" ? "universal-browser-host.exe" : "universal-browser-host");
const seaConfig = path.join(dist, "sea-config.json");

await fs.mkdir(dist, { recursive: true });
await build({ entryPoints: [path.join(root, "src", "native-host.mjs")], outfile: bundle, bundle: true, platform: "node", format: "cjs", target: "node22", minify: false });
await fs.writeFile(seaConfig, `${JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }, null, 2)}\n`);
await execFileAsync(process.execPath, ["--experimental-sea-config", seaConfig], { cwd: root });
await fs.copyFile(process.execPath, executable);
if (process.platform !== "win32") await fs.chmod(executable, 0o755);

const postject = path.join(root, "node_modules", "postject", "dist", "cli.js");
const args = [executable, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (process.platform === "darwin") args.push("--macho-segment-name", "NODE_SEA");
await execFileAsync(process.execPath, [postject, ...args], { cwd: root, windowsHide: true });
process.stdout.write(`Built native host: ${executable}\n`);
