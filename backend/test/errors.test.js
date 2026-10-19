import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);

    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
});

test("unknown routes return a JSON 404", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-type")?.includes("application/json"), true);
    assert.deepEqual(body, {
        error: "Route not found.",
        path: "/api/does-not-exist",
    });
});

test("malformed JSON returns a JSON 400", async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: '{"items": ',
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
        error: "Invalid JSON request body.",
    });
});
