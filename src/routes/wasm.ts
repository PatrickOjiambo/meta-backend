import { Router, Request, Response } from "express";
const router = Router();
import fs from "fs";
import path from "path";

router.get('/proxy-wasm', async (_: Request, res: Response) => {
    fs.createReadStream(path.resolve(__dirname, `../resources/proxy_caller.wasm`)).pipe(res);
});

export default router;