/**
 * Inngest Serve Endpoint
 *
 * Registers all Inngest functions with the Inngest platform.
 * In development, connect to Inngest Dev Server (npx inngest-cli@latest dev).
 * In production, functions are invoked by the Inngest cloud.
 */

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  reportGenerate,
  recordingProcess,
  retentionCleanup,
  sloCheck,
  dataDeletionExecute,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reportGenerate, recordingProcess, retentionCleanup, sloCheck, dataDeletionExecute],
});
