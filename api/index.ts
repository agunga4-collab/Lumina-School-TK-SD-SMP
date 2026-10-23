import express from "express";
import legacyApp from "../server";
import { handleStudentLearningProgress } from "../server/studentLearningProgress.server";
import { handleStudentLpuLevels, isStudentLpuLevelsRequest } from "../server/studentLpuLevels.server";

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (isStudentLpuLevelsRequest(req)) {
    void handleStudentLpuLevels(req, res);
    return;
  }
  next();
});
app.all("/api/student-learning-progress", (req, res) => {
  void handleStudentLearningProgress(req, res);
});
app.use(legacyApp);

export default app;
