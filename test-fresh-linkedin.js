// Quick test script for Fresh LinkedIn Profile Data API
const linkedinUrl = "https://www.linkedin.com/in/alex-ficachi-a74b08168/";
const apiKey = "55a39fc4f3mshd308cd55e762a8fp1db9e0jsn0fb35df9a18b";
const apiHost = "fresh-linkedin-profile-data.p.rapidapi.com";

const url = `https://${apiHost}/get-linkedin-profile`;

console.log("🧪 Testing Fresh LinkedIn Profile Data API");
console.log("📡 Endpoint:", url);
console.log("🔑 API Key:", apiKey.substring(0, 20) + "...");
console.log("🔗 LinkedIn URL:", linkedinUrl);
console.log("");

fetch(url, {
  method: "POST",
  headers: {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": apiHost,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    linkedin_url: linkedinUrl,
    include_skills: true,
  }),
})
  .then((response) => {
    console.log("📊 HTTP Status:", response.status, response.statusText);
    return response.json();
  })
  .then((data) => {
    console.log("");
    console.log("📦 API Response:");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    if (data.data) {
      console.log("✅ SUCCESS! API is working!");
      console.log("");
      console.log("Profile Data:");
      console.log("  Name:", data.data?.firstName, data.data?.lastName);
      console.log("  Headline:", data.data?.headline);
      console.log("  Location:", data.data?.city, data.data?.state, data.data?.country);
      console.log("  Profile Picture:", data.data?.profile_pic_url ? "✅ Yes" : "❌ No");
      console.log("  Experiences:", data.data?.experiences?.length || 0);
      console.log("  Education:", data.data?.education?.length || 0);
      console.log("  Skills:", data.data?.skills?.length || 0);
    } else if (data.message) {
      console.log("⚠️  API Response Message:", data.message);
      if (data.message.includes("subscribe")) {
        console.log("");
        console.log("💡 You need to subscribe to this API first!");
        console.log("   Visit: https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data");
      }
    } else {
      console.log("❌ FAILED! Unexpected response structure");
    }
  })
  .catch((error) => {
    console.error("❌ Error:", error.message);
  });
