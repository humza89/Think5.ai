// Test script for company import API
const testUrl = "https://www.linkedin.com/company/waybridge-clinics";

async function testCompanyImport() {
  console.log(`\n🧪 Testing company import with URL: ${testUrl}\n`);

  try {
    const response = await fetch("http://localhost:3000/api/clients/import-linkedin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        linkedinUrl: testUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ API Error:", data);
      process.exit(1);
    }

    console.log("✅ Company import successful!");
    console.log("\n📊 Company Data:");
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testCompanyImport();
