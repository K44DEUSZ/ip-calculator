import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { releaseLibrary, validateNotificationConfiguration } from "../scripts/release-helper.mjs";

const revision = "a".repeat(40);
const filename = "k44deusz-ip-calculator-1.0.1.tgz";
const bytes = Buffer.from("packed and tested release");
const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");

function fixture(options = {}) {
  const calls = [];
  const outputs = [];
  const state = {
    latest: options.latest === undefined ? { tag_name: "v1.0.0" } : options.latest,
    draft: options.draft ?? null,
    failUpload: options.failUpload ?? false,
    failPublish: options.failPublish ?? false,
  };
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  const dependencies = {
    env: {
      GITHUB_REPOSITORY: "K44DEUSZ/ip-calculator",
      GITHUB_REF: "refs/heads/main",
      GITHUB_TOKEN: "test-token",
      GITHUB_OUTPUT: "workflow-output",
      RELEASE_VERSION: "1.0.1",
    },
    io: {
      readFileSync(file) {
        if (file === "package.json")
          return JSON.stringify({
            name: "@k44deusz/ip-calculator",
            version: "1.0.1",
            license: "MIT",
          });
        assert.equal(file, filename);
        return bytes;
      },
      appendFileSync(file, text) {
        assert.equal(file, "workflow-output");
        outputs.push(text);
      },
    },
    exec(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git") {
        if (args[0] === "fetch") return "";
        if (args[0] === "rev-parse")
          return args[1] === "origin/main" && options.stale ? "b".repeat(40) : revision;
        if (args[0] === "tag") return options.tagExists ? "v1.0.1" : "";
      }
      if (command === "npm" && args[0] === "run") return "";
      if (command === "npm" && args[0] === "pack") return JSON.stringify([{ filename }]);
      throw new Error("Unexpected mocked command");
    },
    async fetchImpl(url, request) {
      const method = request.method;
      calls.push(method + " " + url);
      if (url.endsWith("/releases/latest")) return response(state.latest, state.latest ? 200 : 404);
      if (url.endsWith("/releases/tags/v1.0.1"))
        return response(state.draft, state.draft ? 200 : 404);
      if (url.endsWith("/releases") && method === "POST") {
        assert.deepEqual(JSON.parse(request.body), {
          tag_name: "v1.0.1",
          target_commitish: revision,
          name: "v1.0.1",
          generate_release_notes: true,
          draft: true,
        });
        state.draft = {
          id: 123,
          draft: true,
          target_commitish: revision,
          upload_url: "https://uploads.github.com/mock{?name,label}",
          assets: [],
        };
        return response(state.draft, 201);
      }
      if (url.startsWith("https://uploads.github.com/")) {
        assert.equal(request.body, bytes);
        if (state.failUpload) return response({}, 503);
        const asset = { name: filename, digest: options.badDigest ? "sha256:wrong" : digest };
        state.draft.assets.push(asset);
        return response(asset, 201);
      }
      if (url.endsWith("/releases/123") && method === "PATCH") {
        assert.deepEqual(JSON.parse(request.body), { draft: false });
        if (state.failPublish) return response({}, 503);
        state.draft.draft = false;
        return response(state.draft);
      }
      throw new Error("Unexpected mocked request");
    },
    log() {},
  };
  return { run: () => releaseLibrary(dependencies), calls, outputs, state, dependencies };
}

test("publishes a draft only after the exact archive digest is confirmed", async () => {
  const attempt = fixture();
  await attempt.run();
  assert.equal(attempt.state.draft.draft, false);
  assert.deepEqual(attempt.outputs, ["tag=v1.0.1\n"]);
});

test("an upload failure leaves a draft that the same revision can retry", async () => {
  const attempt = fixture({ failUpload: true });
  await assert.rejects(attempt.run(), /upload failed: 503/);
  assert.equal(attempt.state.draft.draft, true);
  assert.deepEqual(attempt.outputs, []);
  attempt.state.failUpload = false;
  await attempt.run();
  assert.equal(attempt.calls.filter((call) => call.endsWith("/releases")).length, 1);
  assert.equal(attempt.state.draft.draft, false);
});

test("retrying a failed publication reuses its matching uploaded asset", async () => {
  const attempt = fixture({ failPublish: true });
  await assert.rejects(attempt.run(), /request failed: 503/);
  assert.equal(attempt.state.draft.draft, true);
  attempt.state.failPublish = false;
  await attempt.run();
  assert.equal(attempt.calls.filter((call) => call.includes("uploads.github.com")).length, 1);
  assert.deepEqual(attempt.outputs, ["tag=v1.0.1\n"]);
});

test("rejects a changed draft asset and a digest mismatch without publication", async () => {
  for (const options of [
    { badDigest: true },
    {
      draft: {
        id: 123,
        draft: true,
        target_commitish: revision,
        upload_url: "https://uploads.github.com/mock{?name,label}",
        assets: [{ name: filename, digest: "sha256:changed" }],
      },
    },
  ]) {
    const attempt = fixture(options);
    await assert.rejects(attempt.run(), /digest mismatch|differs from the tested package/);
    assert.equal(
      attempt.calls.some((call) => call.startsWith("PATCH ")),
      false,
    );
    assert.deepEqual(attempt.outputs, []);
  }
});

test("blocks collisions with a source tag, published release or another revision", async () => {
  for (const options of [
    { tagExists: true },
    { latest: { tag_name: "v1.0.1" } },
    { draft: { draft: false, target_commitish: revision } },
    { draft: { draft: true, target_commitish: "b".repeat(40) } },
  ]) {
    const attempt = fixture(options);
    await assert.rejects(
      attempt.run(),
      /tag already exists|replaced or downgraded|another publication/,
    );
    assert.equal(
      attempt.calls.some((call) => call.startsWith("POST ")),
      false,
    );
    assert.deepEqual(attempt.outputs, []);
  }
});

test("stale main and invalid workflow context cannot publish", async () => {
  const stale = fixture({ stale: true });
  await stale.run();
  assert.equal(
    stale.calls.some((call) => call.startsWith("GET ")),
    false,
  );
  for (const override of [
    { GITHUB_REF: "refs/heads/test" },
    { GITHUB_REPOSITORY: "someone/ip-calculator" },
    { GITHUB_TOKEN: "" },
    { GITHUB_OUTPUT: "" },
    { RELEASE_VERSION: "1.0.2" },
  ]) {
    const attempt = fixture();
    Object.assign(attempt.dependencies.env, override);
    await assert.rejects(attempt.run());
    assert.equal(
      attempt.calls.some((call) => call.startsWith("POST ")),
      false,
    );
  }
});

test("notification configuration is explicit and rejects partial app setup", () => {
  assert.equal(validateNotificationConfiguration(), "manual");
  assert.equal(validateNotificationConfiguration("123", "test-key"), "automatic");
  for (const [appId, key] of [
    ["123", ""],
    ["", "test-key"],
    ["abc", "test-key"],
    ["123", "  "],
  ])
    assert.throws(() => validateNotificationConfiguration(appId, key), /Configure both/);
});
