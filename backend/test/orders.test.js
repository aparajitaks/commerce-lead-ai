import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

const prismaMock = {
  paymentOrder: {
    findMany: mock.fn(),
  },
};

mock.module("../src/lib/prisma.js", {
  defaultExport: prismaMock,
});

mock.module("@prisma/client", {
  namedExports: {
    PrismaClient: class PrismaClient {
      constructor() {
        return prismaMock;
      }
    },
  },
});

// Import the app only after registering the Prisma mock.
const { app } = await import("../src/index.js");

let server;
let baseUrl;

beforeEach(async () => {
  prismaMock.paymentOrder.findMany.mock.resetCalls();
  prismaMock.paymentOrder.findMany.mock.mockImplementation(async () => []);

  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    server = undefined;
  }
});

test("returns completed orders newest first", async () => {
  const orders = [
    {
      id: "order-new",
      amount: "54.98",
      currency: "USD",
      description: "Portable Speaker and Insulated Bottle",
      captureId: "capture-new",
      paypalOrderId: "paypal-new",
      createdAt: "2026-10-15T07:41:06.497Z",
    },
  ];

  prismaMock.paymentOrder.findMany.mock.mockImplementation(async () => orders);

  const response = await fetch(`${baseUrl}/api/orders`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.orders, orders);
  assert.deepEqual(
    prismaMock.paymentOrder.findMany.mock.calls[0].arguments[0],
    {
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        description: true,
        captureId: true,
        paypalOrderId: true,
        createdAt: true,
      },
      take: 100,
    }
  );
});

test("returns an empty list when there are no completed orders", async () => {
  const response = await fetch(`${baseUrl}/api/orders`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { orders: [] });
});

test("returns 500 when the database lookup fails", async () => {
  prismaMock.paymentOrder.findMany.mock.mockImplementation(async () => {
    throw new Error("Simulated database failure");
  });

  const response = await fetch(`${baseUrl}/api/orders`);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "Unable to retrieve order history.",
  });
});
