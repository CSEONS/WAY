import { handleNotification } from "../services/onlinePaymentService.js";
import { asyncHandler } from "../utils/http.js";

/** ЮKassa's HTTP notification: 200 once handled or not ours; an error makes ЮKassa send it again. */
export const notification = asyncHandler(async (req, res) => {
  await handleNotification(req.body);
  res.sendStatus(200);
});
