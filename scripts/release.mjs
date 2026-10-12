import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const repository = process.env.GITHUB_REPOSITORY;
if (
  !["K44DEUSZ/ip-utils", "K44DEUSZ/password-generator"].includes(repository) ||
  process.env.GITHUB_REF !== "refs/heads/main"
)
  throw new Error("Unexpected release repository or branch");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const token = process.env.GITHUB_TOKEN;
async function request(endpoint, method = "GET", body) {
  const response = await fetch("https://api.github.com/repos/" + repository + endpoint, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && method === "GET") return null;
  const data = await response.json();
  if (!response.ok) throw new Error("GitHub release request failed: " + response.status);
  return data;
}
git("fetch", "origin", "main");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
  console.log("A newer push will publish the next release.");
  process.exit(0);
}
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const latest = await request("/releases/latest");
const pattern = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const proposed = pattern.exec(manifest.version),
  previous = latest ? pattern.exec(latest.tag_name) : null;
if (!proposed || (latest && !previous)) throw new Error("Expected stable semantic versions");
let version = manifest.version;
if (previous) {
  const comparison =
    [1, 2, 3]
      .map((index) => Number(proposed[index]) - Number(previous[index]))
      .find((value) => value !== 0) ?? 0;
  if (comparison < 0) throw new Error("Package version is older than its latest release");
  if (comparison === 0) version = previous[1] + "." + previous[2] + "." + (Number(previous[3]) + 1);
}
if (version !== manifest.version) {
  manifest.version = version;
  fs.writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  lock.version = version;
  lock.packages[""].version = version;
  fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  git("add", "package.json", "package-lock.json");
  git("commit", "-m", "Podniesienie wersji biblioteki do " + version);
  git("push", "origin", "HEAD:main");
}
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
const packages = JSON.parse(execFileSync("npm", ["pack", "--json"], { encoding: "utf8" }));
const archive = packages[0].filename;
const revision = git("rev-parse", "HEAD");
let created = await request("/releases/tags/v" + version);
if (created && (!created.draft || created.target_commitish !== revision))
  throw new Error("The release tag already belongs to another publication");
if (!created)
  created = await request("/releases", "POST", {
    tag_name: "v" + version,
    target_commitish: revision,
    name: "v" + version,
    generate_release_notes: true,
    draft: true,
  });
const uploadUrl = created.upload_url.split("{")[0] + "?name=" + encodeURIComponent(archive);
const bytes = fs.readFileSync(archive),
  digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
const existing = created.assets.find((asset) => asset.name === archive);
if (existing && existing.digest !== digest)
  throw new Error("Draft asset differs from the tested package");
if (!existing) {
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/gzip" },
    body: bytes,
    signal: AbortSignal.timeout(60000),
  });
  if (!upload.ok) throw new Error("Release asset upload failed: " + upload.status);
  const asset = await upload.json();
  if (asset.digest !== digest) throw new Error("Uploaded package digest mismatch");
}
await request("/releases/" + created.id, "PATCH", { draft: false });
fs.appendFileSync(process.env.GITHUB_OUTPUT, "tag=v" + version + "\n");
console.log("Published " + repository + " v" + version);
