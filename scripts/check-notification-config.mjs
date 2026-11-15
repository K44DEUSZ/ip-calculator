import { validateNotificationConfiguration } from "./release-helper.mjs";

const mode = validateNotificationConfiguration(
  process.env.LIBRARY_APP_ID,
  process.env.LIBRARY_APP_PRIVATE_KEY,
);
console.log(
  mode === "automatic"
    ? "Automatic Tools synchronization is configured."
    : "No dispatch app configured; synchronize Tools manually after publication.",
);
