import { NextRequest } from "next/server";
import sharp from "sharp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing URL", { status: 400 });
  }

  // ?size=N  — clamped to 64–800. Defaults to 500 (browse cards, covers 2× retina on 3/4-col grids).
  // Now Playing mode requests 600 for crisp Retina display.
  const sizeParam = parseInt(searchParams.get("size") ?? "500");
  const size = Math.min(Math.max(isNaN(sizeParam) ? 500 : sizeParam, 64), 800);
  const quality = 90;

  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();

    const resized = await sharp(Buffer.from(buffer))
      .resize(size, size, { fit: "cover" })
      .jpeg({ quality })
      .toBuffer();

    return new Response(new Uint8Array(resized), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800", // 7 days
      },
    });
  } catch {
    return new Response("Error processing image", { status: 500 });
  }
}
