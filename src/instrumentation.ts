/**
 * Runs once when the server boots. The Node-only work (Prisma, Twilio) lives in
 * ./instrumentation-node and is imported only under the nodejs runtime guard, so
 * it is never pulled into the Edge middleware bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
