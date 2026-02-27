import { NextRequest } from "next/server";
import sharp from "sharp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing URL", { status: 400 });
  }

  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();

    const resized = await sharp(Buffer.from(buffer))
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 60 })
      .toBuffer();

    return new Response(new Uint8Array(resized), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (error) {
    return new Response("Error processing image", { status: 500 });
  }
}
