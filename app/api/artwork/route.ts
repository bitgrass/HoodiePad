import {
  getStoredObject,
  ObjectStorageUnavailableError,
  putStoredObject,
} from "../../lib/object-storage";

const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const supportedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function sha256(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("artwork");

  if (!(file instanceof File)) {
    return Response.json({ error: "Choose an artwork file." }, { status: 400 });
  }

  const extension = supportedTypes.get(file.type);
  if (!extension || file.size === 0 || file.size > MAX_ARTWORK_BYTES) {
    return Response.json(
      { error: "Artwork must be a JPG, PNG, or WebP file no larger than 5 MB." },
      { status: 422 },
    );
  }

  const bytes = await file.arrayBuffer();
  const digest = await sha256(bytes);
  const key = `token-artwork/${digest}.${extension}`;

  try {
    await putStoredObject(key, bytes, {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
      customMetadata: { originalName: file.name.slice(0, 160), sha256: digest },
    });
  } catch (error) {
    if (error instanceof ObjectStorageUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const artworkUrl = new URL("/api/artwork", request.url);
  artworkUrl.searchParams.set("key", key);

  return Response.json({
    key,
    url: artworkUrl.toString(),
    sha256: digest,
    contentType: file.type,
    size: file.size,
  });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!/^token-artwork\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(key)) {
    return new Response("Invalid artwork key", { status: 400 });
  }

  let object;
  try {
    object = await getStoredObject(key);
  } catch (error) {
    if (error instanceof ObjectStorageUnavailableError) {
      return new Response(error.message, { status: 503 });
    }
    throw error;
  }
  if (!object) return new Response("Artwork not found", { status: 404 });

  const headers = new Headers({
    "content-type": object.contentType,
    "cache-control": object.cacheControl,
    etag: object.etag,
  });
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
