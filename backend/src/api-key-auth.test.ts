import test from "node:test";
import assert from "node:assert/strict";

import { requireApiKey } from "./api-key-auth.js";

function createResponseRecorder() {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
  };

  return {
    state,
    response: {
      status(code: number) {
        state.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        state.body = payload;
        return this;
      },
    },
  };
}

test("requireApiKey allows request when X-API-Key matches configured value", () => {
  process.env.READONLY_API_KEY = "readonly-test-key";

  let nextCalled = false;
  const { response, state } = createResponseRecorder();
  const request = {
    headers: {
      "X-API-Key": "readonly-test-key",
    },
  };

  requireApiKey(
    request as any,
    response as any,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(state.statusCode, 200);
  assert.equal(state.body, undefined);
});

test("requireApiKey rejects request when READONLY_API_KEY is not configured", () => {
  delete process.env.READONLY_API_KEY;

  let nextCalled = false;
  const { response, state } = createResponseRecorder();
  const request = {
    headers: {
      "x-api-key": "readonly-test-key",
    },
  };

  requireApiKey(
    request as any,
    response as any,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    code: 401,
    message: "Unauthorized",
    data: null,
  });
});

test("requireApiKey rejects request when X-API-Key does not match configured value", () => {
  process.env.READONLY_API_KEY = "readonly-test-key";

  let nextCalled = false;
  const { response, state } = createResponseRecorder();
  const request = {
    headers: {
      "x-api-key": "wrong-key",
    },
  };

  requireApiKey(
    request as any,
    response as any,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    code: 401,
    message: "Unauthorized",
    data: null,
  });
});
