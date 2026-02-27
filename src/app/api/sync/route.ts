import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.DISCOGS_TOKEN;
  const username = (process.env.DISCOGS_USER || '').replace(/[\u201C\u201D"]/g, '').trim();

  console.log("------------------------------------------------");
  console.log("🚨 [INBOUND] TABLET IS REQUESTING COLLECTION...");
  console.log("DEBUG token:", token?.slice(0,6), "user:", username);
  console.log("DEBUG url:", `https://api.discogs.com/users/${username}/collection/folders/0/releases?per_page=50`);
  console.log("------------------------------------------------");

  if (!token || token.includes("YOUR_ACTUAL")) {
    console.error("❌ ERROR: Set your Discogs Token in .env.local!");
    return NextResponse.json({ error: "Config Missing" }, { status: 400 });
  }

  try {
    // Using 'all_releases' is often more reliable than specific folder IDs for initial syncs
    const url = `https://api.discogs.com/users/${username}/collection/folders/0/releases?per_page=50&sort=added&sort_order=desc`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SpinWatcher/1.0",
        Authorization: `Discogs token=${token}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ Discogs API Error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Discogs Error" }, { status: response.status });
    }

    const data = await response.json();
    const records = data.releases.map((item: any) => ({
      id: item.id,
      title: item.basic_information.title,
      artist: item.basic_information.artists[0]?.name,
      cover: item.basic_information.cover_image,
    }));

    console.log(`✅ SUCCESS: Sending ${records.length} records to the Lelik Tec.`);
    return NextResponse.json(records);
  } catch (error) {
    console.error("❌ CRITICAL SERVER ERROR:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
