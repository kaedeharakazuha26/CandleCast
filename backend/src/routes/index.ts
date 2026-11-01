import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as market from "../controllers/marketController.js";
import * as predictions from "../controllers/predictionController.js";
import * as backtests from "../controllers/backtestController.js";
import * as watchlist from "../controllers/watchlistController.js";

export const router = Router();

router.get("/market/symbols", asyncHandler(market.symbols));
router.get("/market/tickers", asyncHandler(market.tickers));
router.get("/market/ticker/:symbol", asyncHandler(market.ticker));
router.get("/market/klines/:symbol", asyncHandler(market.klines));
router.get("/indicators/:symbol", asyncHandler(market.indicators));

router.post("/predictions/generate", asyncHandler(predictions.generate));
router.get("/predictions/history", asyncHandler(predictions.history));
router.get("/predictions/export", asyncHandler(predictions.exportHistory));
router.get("/predictions/accuracy", asyncHandler(predictions.accuracy));
router.post("/predictions/evaluate-pending", asyncHandler(predictions.evaluatePending));
router.get("/predictions/:id", asyncHandler(predictions.getOne));
router.get("/predictions/:id/export", asyncHandler(predictions.exportCsv));
router.get("/model/info", asyncHandler(predictions.modelStatus));

router.post("/backtesting/run", asyncHandler(backtests.runBacktest));
router.get("/backtesting/results", asyncHandler(backtests.listBacktests));
router.get("/backtesting/:id", asyncHandler(backtests.getBacktest));
router.get("/backtesting/:id/export", asyncHandler(backtests.exportBacktest));

router.get("/watchlist", asyncHandler(watchlist.listWatchlist));
router.post("/watchlist", asyncHandler(watchlist.addWatchlist));
router.delete("/watchlist/:id", asyncHandler(watchlist.removeWatchlist));

router.get("/alerts", asyncHandler(watchlist.listAlerts));
router.post("/alerts", asyncHandler(watchlist.addAlert));
router.delete("/alerts/:id", asyncHandler(watchlist.removeAlert));
