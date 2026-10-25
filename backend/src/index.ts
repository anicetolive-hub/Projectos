import cors from "cors";
import express from "express";
import { env } from "./lib/env";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { achievementsRouter } from "./routes/achievements";
import { assistantRouter } from "./routes/assistant";
import { authRouter } from "./routes/auth";
import { performanceRouter } from "./routes/performance";
import { startAlertScheduler } from "./services/performance/alertNotifier";

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);

// Todas as outras rotas da API exigem login
app.use("/api", requireAuth);
app.use("/api/performance/achievements", achievementsRouter);
app.use("/api/performance", performanceRouter);
app.use("/api/assistant", assistantRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`API de Tarefas e Projectos a correr em http://localhost:${env.port}`);
  startAlertScheduler();
});
