import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { viewerSessionScript } from "../../src/machines/viewer-transport";

test("viewer RPCs include the issuing cookie only inside their same-origin opaque gateway", async () => {
  const calls: { input: string | Request; init?: RequestInit }[] = [];
  const location = new URL(
    "https://workspace.example/v1/machine/viewer/own-view/viewer/#ticket=fixture",
  );
  const window = {
    fetch: async (input: string | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response();
    },
  };
  runInNewContext(viewerSessionScript, { window, location, URL, Request });
  await window.fetch("../cua.env.v1.SystemService/GetCapabilities", {
    credentials: "omit",
    method: "POST",
    headers: { "content-type": "application/grpc-web+proto" },
  });
  expect(calls[0]?.init?.credentials).toBe("same-origin");
  expect(calls[0]?.init?.method).toBe("POST");
  expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe(
    "application/grpc-web+proto",
  );
  for (const input of [
    "https://other.example/cua.env.v1.SystemService/GetCapabilities",
    "/v1/machine/viewer/other-view/cua.env.v1.SystemService/GetCapabilities",
    "/v1/auth/session",
  ]) {
    await window.fetch(input, { credentials: "omit" });
    expect(calls.at(-1)?.init?.credentials).toBe("omit");
  }
});

test("viewer transport preserves a Request body and leaves device credentials to the browser", async () => {
  const location = new URL("http://127.0.0.1:4320/v1/machine/viewer/own-view/viewer/");
  let received: RequestInit | undefined;
  let original: string | Request | undefined;
  const window = {
    fetch: async (input: string | Request, init?: RequestInit) => {
      original = input;
      received = init;
      return new Response();
    },
  };
  runInNewContext(viewerSessionScript, { window, location, URL, Request });
  const input = new Request(new URL("../cua.env.v1.StreamService/OpenMedia", location), {
    method: "POST",
    body: "fixture-frame",
    credentials: "omit",
  });
  await window.fetch(input);
  expect(original).toBe(input);
  expect(await input.text()).toBe("fixture-frame");
  expect(received).toEqual({ credentials: "same-origin" });
});
