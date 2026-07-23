import { getRuntimeEnv } from "../../runtime-env";

const metadataKeyPattern = /^token-metadata\/[a-f0-9]{64}\.json$/;

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!metadataKeyPattern.test(key)) {
    return new Response("Invalid metadata key", { status: 400 });
  }

  const object = await getRuntimeEnv().ARTWORK.get(key);
  if (!object) return new Response("Metadata not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
