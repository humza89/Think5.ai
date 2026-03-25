/**
 * Quick test: which setup fields does gemini-2.5-flash-native-audio accept?
 * Run: node test-gemini-ws.mjs
 *
 * Requires GEMINI_API_KEY in .env.local or environment
 */

import { readFileSync } from "fs";

// Load API key from .env.local
let API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  try {
    const envFile = readFileSync(".env", "utf8");
    const match = envFile.match(/GEMINI_API_KEY=(.+)/);
    if (match) API_KEY = match[1].trim();
  } catch {}
}
if (!API_KEY) {
  console.error("No GEMINI_API_KEY found");
  process.exit(1);
}

const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const TESTS = [
  {
    name: "1. Minimal (model + AUDIO only)",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
    },
  },
  {
    name: "2. + speechConfig",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    },
  },
  {
    name: "3. + systemInstruction (no role)",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      systemInstruction: {
        parts: [{ text: "You are a friendly interviewer named Aria." }],
      },
    },
  },
  {
    name: "4. + outputAudioTranscription at setup level",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      outputAudioTranscription: {},
    },
  },
  {
    name: "5. + outputAudioTranscription INSIDE generationConfig",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
        outputAudioTranscription: {},
      },
    },
  },
  {
    name: "6. + tools (single wrapper)",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      tools: [{
        functionDeclarations: [{
          name: "endInterview",
          description: "End the interview",
          parameters: {
            type: "object",
            properties: {
              reason: { type: "string", description: "Why" },
            },
            required: ["reason"],
          },
        }],
      }],
    },
  },
  {
    name: "7. Full combo (all fields)",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: "You are Aria, a friendly AI interviewer." }],
      },
      outputAudioTranscription: {},
      tools: [{
        functionDeclarations: [{
          name: "endInterview",
          description: "End the interview",
          parameters: {
            type: "object",
            properties: {
              reason: { type: "string", description: "Why" },
            },
            required: ["reason"],
          },
        }],
      }],
    },
  },
  {
    name: "8. + inputAudioTranscription",
    setup: {
      model: "models/gemini-2.5-flash-native-audio-latest",
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
  },
];

async function testSetup(config) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ status: "TIMEOUT", code: null });
    }, 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ setup: config.setup }));
    };

    ws.onmessage = async (event) => {
      try {
        let text;
        if (event.data instanceof Blob) {
          text = await event.data.text();
        } else if (typeof event.data === "string") {
          text = event.data;
        } else {
          text = event.data.toString();
        }
        const data = JSON.parse(text);
        if (data.setupComplete) {
          clearTimeout(timeout);
          ws.close();
          resolve({ status: "OK", code: null });
        } else {
          clearTimeout(timeout);
          ws.close();
          resolve({ status: "UNEXPECTED", code: null, data });
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        resolve({ status: "PARSE_ERROR", code: null, data: String(err) });
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ status: "ERROR", code: null });
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      resolve({ status: `CLOSED`, code: event.code, reason: event.reason });
    };
  });
}

console.log("Testing Gemini Live WebSocket setup configurations...\n");

for (const test of TESTS) {
  process.stdout.write(`${test.name} ... `);
  const result = await testSetup(test);
  if (result.status === "OK") {
    console.log("✅ setupComplete received");
  } else if (result.status === "TIMEOUT") {
    console.log("⏰ TIMEOUT (no response in 8s)");
  } else if (result.status === "CLOSED") {
    console.log(`❌ CLOSED code=${result.code} reason=${result.reason}`);
  } else {
    console.log(`❓ ${result.status}`, result.data ? JSON.stringify(result.data).slice(0, 100) : "");
  }
}

console.log("\nDone.");
