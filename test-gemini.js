// test-gemini.js
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testGeminiFaceBbox() {
  const imgPath = path.join(__dirname, 'public/uploads/linkedin-paulcruse3-avatar-118767b3412d169a.jpg');
  const buffer = fs.readFileSync(imgPath);
  const base64 = buffer.toString('base64');
  
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
          { text: "Return exclusively a JSON object with a single key 'face' representing the person's face bounding box (chin to forehead, ear to ear). The value should be an array [ymin, xmin, ymax, xmax] using normalized coordinates 0-1000. Do not include markdown formatting like ```json." }
        ]
      }
    ]
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  
  if (data.candidates && data.candidates[0].content.parts[0].text) {
     console.log("RESPONSE:", data.candidates[0].content.parts[0].text);
  }
}

testGeminiFaceBbox().catch(console.error);
