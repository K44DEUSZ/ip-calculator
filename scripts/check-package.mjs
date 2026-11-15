import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check through npm run check:package");
const temporaryRoot = fs.realpathSync(os.tmpdir());
const temporary = fs.mkdtempSync(path.join(temporaryRoot, "k44deusz-package-"));
function npm(args, cwd) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}
try {
  const packed = JSON.parse(
    npm(["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], root),
  );
  assert.equal(packed.length, 1);
  assert.ok(
    !packed[0].files.some((file) => /(^|\/)changelog(?:\.[^/]*)?$/i.test(file.path)),
    "Changelogs must remain outside published packages",
  );
  const archive = path.join(temporary, packed[0].filename);
  const consumer = path.join(temporary, "consumer");
  fs.mkdirSync(consumer);
  fs.writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  npm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", archive],
    consumer,
  );
  const name = manifest.name;
  const smoke = `import assert from "node:assert/strict";
import * as api from ${JSON.stringify(name)};
assert.ok(Object.keys(api).length > 0);
assert.equal(api.formatAddress(api.calculateSubnet("192.168.1.42", "24", 4).network, 4), "192.168.1.0");
`;
  fs.writeFileSync(path.join(consumer, "smoke.mjs"), smoke);
  execFileSync(process.execPath, [path.join(consumer, "smoke.mjs")], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log("Packed ESM consumer passed: " + name);
  const compiler = path.join(root, "node_modules/typescript/bin/tsc");
  const imports = Object.keys(manifest.exports ?? { ".": {} }).map((entry) =>
    entry === "." ? name : `${name}${entry.slice(1)}`,
  );
  fs.writeFileSync(
    path.join(consumer, "browser.mts"),
    imports
      .map(
        (entry, index) =>
          `import * as api${index} from ${JSON.stringify(entry)}; void api${index};`,
      )
      .join("\n"),
  );
  const coreEntry = manifest.exports?.["./core"] ? `${name}/core` : name;
  fs.writeFileSync(
    path.join(consumer, "node.mts"),
    `import * as api from ${JSON.stringify(coreEntry)}; void api;\n`,
  );
  for (const [kind, module, moduleResolution, libs, types] of [
    ["browser", "NodeNext", "NodeNext", ["ES2022", "DOM"], []],
    ["browser", "ESNext", "Bundler", ["ES2022", "DOM"], []],
    ["node", "NodeNext", "NodeNext", ["ES2022"], ["node"]],
  ]) {
    const config = {
      compilerOptions: {
        target: "ES2022",
        module,
        moduleResolution,
        lib: libs,
        types,
        typeRoots: [path.join(root, "node_modules/@types")],
        noEmit: true,
        strict: true,
        skipLibCheck: false,
      },
      files: [`${kind}.mts`],
    };
    fs.writeFileSync(path.join(consumer, "tsconfig.json"), JSON.stringify(config));
    execFileSync(process.execPath, [compiler, "--project", path.join(consumer, "tsconfig.json")], {
      cwd: consumer,
      stdio: "inherit",
    });
  }
  console.log("Packed TypeScript consumers passed: " + name);
} finally {
  const resolved = fs.realpathSync(temporary);
  if (
    path.dirname(resolved) === temporaryRoot &&
    path.basename(resolved).startsWith("k44deusz-package-")
  ) {
    fs.rmSync(temporary, { recursive: true, force: true });
  } else {
    console.error("Unexpected package-check temporary directory; cleanup was skipped");
    process.exitCode = 1;
  }
}
