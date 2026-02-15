// Quick test script for RockAPIs LinkedIn Scraper
const linkedinUrl = "https://www.linkedin.com/in/alex-ficachi-a74b08168/";
const apiKey = "55a39fc4f3mshd308cd55e762a8fp1db9e0jsn0fb35df9a18b";
const apiHost = "linkedin-api8.p.rapidapi.com";

const url = `https://${apiHost}/get-profile-data-by-url?url=${encodeURIComponent(linkedinUrl)}`;

console.log("🧪 Testing RockAPIs LinkedIn Scraper API");
console.log("📡 URL:", url);
console.log("🔑 API Key:", apiKey.substring(0, 20) + "...");
console.log("");

fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": apiHost,
  },
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

    if (data.success) {
      console.log("✅ SUCCESS! API is working!");
      console.log("");
      console.log("Profile Data:");
      console.log("  Name:", data.data?.firstName, data.data?.lastName);
      console.log("  Headline:", data.data?.headline);
      console.log("  Location:", data.data?.geo?.full);
      console.log("  Profile Picture:", data.data?.profilePicture ? "✅ Yes" : "❌ No");
      console.log("  Experiences:", data.data?.experiences?.length || 0);
      console.log("  Education:", data.data?.educations?.length || 0);
      console.log("  Skills:", data.data?.skills?.length || 0);
    } else {
      console.log("❌ FAILED! API returned success=false");
      console.log("Message:", data.message);
    }
  })
  .catch((error) => {
    console.error("❌ Error:", error.message);
  });
