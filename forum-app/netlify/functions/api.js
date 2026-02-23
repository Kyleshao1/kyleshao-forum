import serverless from "serverless-http";
import { app, ensureInit } from "../../backend/index.js";

const serverlessHandler = serverless(app, { basePath: "/.netlify/functions/api" });

export const handler = async (event, context) => {
  await ensureInit();
  return serverlessHandler(event, context);
};
