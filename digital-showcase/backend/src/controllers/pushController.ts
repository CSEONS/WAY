import * as pushService from "../services/pushService.js";
import { asyncHandler } from "../utils/http.js";
import { parseBody, pushEndpointSchema, pushSubscriptionSchema } from "../utils/validation.js";

/** The key the browser subscribes with. */
export const publicKey = asyncHandler(async (_req, res) => {
  res.json({ publicKey: pushService.pushPublicKey() });
});

/** Turned on on this phone (welcome), or signed in on a phone that has them on. */
export const subscribe = asyncHandler(async (req, res) => {
  const { welcome, ...input } = parseBody(pushSubscriptionSchema, req.body);
  res.json(await pushService.subscribe(req.user!.userId, input, { welcome }));
});

export const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = parseBody(pushEndpointSchema, req.body);
  await pushService.unsubscribe(req.user!.userId, endpoint);
  res.status(204).end();
});

/** «Проверить»: sent — on its way; gone — this phone must turn them on again; failed — the push service didn't take it. */
export const test = asyncHandler(async (req, res) => {
  const { endpoint } = parseBody(pushEndpointSchema, req.body);
  res.json({ result: await pushService.sendTest(req.user!.userId, endpoint) });
});
