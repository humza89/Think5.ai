import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  // Find a test image
  const imgPath = process.argv[2];
  if (!imgPath) {
    console.error("Provide image path");
    process.exit(1);
  }
  
  const buffer = fs.readFileSync(imgPath);
  const base64 = buffer.toString("base64");
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64 } },
        { text: "Output a JSON object with exactly one key 'face' containing the bounding box in the format [ymin, xmin, ymax, xmax] using normalized coordinates 0-1000 representing the person's face (chin to forehead, ear to ear). Do not include markdown formatting or extra text." }
      ]
    }]
  });
  
  console.log(response.text);
}

main().catch(console.error);
