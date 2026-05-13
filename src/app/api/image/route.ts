import { NextRequest } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/session";

const ALLOWED_IMAGE_HOSTS = /^https:\/\/[a-z0-9-]+\.discogs\.com\//;
const MAX_IMAGE_BYTES     = 5 * 1024 * 1024; // 5 MB

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing URL", { status: 400 });
  }

  if (!ALLOWED_IMAGE_HOSTS.test(imageUrl)) {
    return new Response("Forbidden", { status: 403 });
  }

  // ?size=N — clamped to 64–800. Defaults to 500 (browse cards).
  const sizeParam = parseInt(searchParams.get("size") ?? "500");
  const size = Math.min(Math.max(isNaN(sizeParam) ? 500 : sizeParam, 64), 800);
  const quality = 90;

  try {
    const response = await fetch(imageUrl);
    const buffer   = await response.arrayBuffer();

    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    const resized = await sharp(Buffer.from(buffer))
      .resize(size, size, { fit: "cover" })
      .jpeg({ quality })
      .toBuffer();

    return new Response(new Uint8Array(resized), {
      headers: {
        "Content-Type":  "image/jpeg",
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return new Response("Error processing image", { status: 500 });
  }
}
