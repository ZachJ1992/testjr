import { Router, type Request, type Response } from "express";

import { requireApiKey } from "./api-key-auth.js";
import { handleError } from "./errorHandler.js";
import {
  getDashboardWaybillsOverview,
  getPlatformRevenueOverview,
} from "./dashboard-store.js";

const router = Router();

function sendSuccess<T>(res: Response, data: T): void {
  res.json({
    code: 0,
    message: "success",
    data,
  });
}

router.get(
  "/dashboard/platform-revenue/overview",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getPlatformRevenueOverview({
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      });

      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/waybills/overview",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardWaybillsOverview(
        {
          customerName: req.query.customerName as string | undefined,
          contractNumber: req.query.contractNumber as string | undefined,
          businessMode: req.query.businessMode as string | undefined,
          status: req.query.status as string | undefined,
          startDate: req.query.startDate as string | undefined,
          endDate: req.query.endDate as string | undefined,
          waybillNumber: req.query.waybillNumber as string | undefined,
          vehiclePlate: req.query.vehiclePlate as string | undefined,
          batchStatus: req.query.batchStatus as string | undefined,
          batchSource: req.query.batchSource as string | undefined,
        }
      );

      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

export default router;
