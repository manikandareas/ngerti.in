import { skillCreate } from "./contracts";

export const optionalSkills = [
  {
    ...skillCreate.parse({
      name: "connected-app-status-brief",
      visibility: "shared",
      package: {
        description: "Check a status against a connected app and report the observed result.",
        instructions: [
          "Identify the requested app and the record or status to verify.",
          "List the connections available in the current conversation. Find and inspect a granted action that only reads the requested information. Use only that action, and do not create, update, or delete anything.",
          "Report the observed status and identify the source. If the app or the required read action is unavailable, ask the user to grant that specific read access in Marketplace. Leave the status unverified until a permitted source returns it.",
        ].join("\n\n"),
      },
    }),
    setup: "Connect the source app in Marketplace and grant its read action to this conversation.",
  },
];
