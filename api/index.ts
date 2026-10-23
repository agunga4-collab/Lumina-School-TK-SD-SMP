import express from "express";
import legacyApp from "../server";
import { handleStudentLearningProgress } from "../server/studentLearningProgress.server";

const app = express();
app.disable("x-powered-by");
app.all("/api/student-learning-progress", (req, res) => {
  void handleStudentLearningProgress(req, res);
});
app.use(legacyApp);

export default app;
