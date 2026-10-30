import { Router, type IRouter } from "express";
import healthRouter from "./health";
import missionRouter from "./mission";

const router: IRouter = Router();

router.use(healthRouter);
router.use(missionRouter);

export default router;
