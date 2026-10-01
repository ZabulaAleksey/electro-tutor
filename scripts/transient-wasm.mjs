import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const crate = join(root, "transient-core");
const output = join(root, "public", "transient-core");
const generated = ["transient_core.js", "transient_core.d.ts",
  "transient_core_bg.wasm", "transient_core_bg.wasm.d.ts"];
const version = "0.2.129";

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : [path];
  });
}

function digest(files) {
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(relative(root, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

function sourceDigest() {
  return digest([
    join(crate, "Cargo.toml"), join(crate, "Cargo.lock"),
    fileURLToPath(import.meta.url), ...collect(join(crate, "src")),
  ]);
}

function run(executable, args, env = process.env) {
  const result = spawnSync(executable, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} exited with ${result.status}`);
}

function build() {
  const localCli = join(root, ".tools", "bin", `wasm-bindgen${process.platform === "win32" ? ".exe" : ""}`);
  const cli = process.env.WASM_BINDGEN_BIN || (existsSync(localCli) ? localCli : "wasm-bindgen");
  const check = spawnSync(cli, ["--version"], { encoding: "utf8" });
  if (check.status !== 0 || check.stdout.trim() !== `wasm-bindgen ${version}`) {
    throw new Error(`wasm-bindgen CLI ${version} required; run cargo install --locked wasm-bindgen-cli --version ${version}`);
  }
  run("cargo", ["build", "--manifest-path", join(crate, "Cargo.toml"),
    "--target", "wasm32-unknown-unknown", "--release", "--locked"]);
  run(cli, [join(crate, "target", "wasm32-unknown-unknown", "release", "transient_core.wasm"),
    "--target", "web", "--out-dir", output]);
  const manifest = {
    schema: 1,
    wasmBindgen: version,
    sourceSha256: sourceDigest(),
    artifactSha256: digest(generated.map(name => join(output, name))),
  };
  writeFileSync(join(output, "build-info.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Rust/WASM artifact built and pinned.");
}

function check() {
  const manifest = JSON.parse(readFileSync(join(output, "build-info.json"), "utf8"));
  if (manifest.schema !== 1 || manifest.wasmBindgen !== version
      || manifest.sourceSha256 !== sourceDigest()
      || manifest.artifactSha256 !== digest(generated.map(name => join(output, name)))) {
    throw new Error("Rust/WASM source and shipped artifact differ; run pnpm wasm:build");
  }
  console.log("Rust/WASM source and shipped artifact match.");
}

if (process.argv[2] === "build") build();
else if (process.argv[2] === "check") check();
else throw new Error("Usage: node scripts/transient-wasm.mjs build|check");
