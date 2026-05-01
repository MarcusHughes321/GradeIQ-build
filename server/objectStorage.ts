import { Storage } from "@google-cloud/storage";
import type { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
});

function getPrivateDir(): string {
  return process.env.PRIVATE_OBJECT_DIR || "";
}

function parsePath(fullPath: string): { bucketName: string; objectName: string } {
  const p = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = p.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  subPath: string,
): Promise<string> {
  const privateDir = getPrivateDir();
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const uuid = randomUUID();
  const objectPath = `${privateDir}/${subPath}/${uuid}`;
  const { bucketName, objectName } = parsePath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return uuid;
}

export async function downloadToResponse(
  subPath: string,
  uuid: string,
  res: Response,
): Promise<boolean> {
  const privateDir = getPrivateDir();
  if (!privateDir) return false;
  const objectPath = `${privateDir}/${subPath}/${uuid}`;
  const { bucketName, objectName } = parsePath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) return false;
  const [metadata] = await file.getMetadata();
  res.set({
    "Content-Type": metadata.contentType || "image/jpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  await new Promise<void>((resolve, reject) => {
    const stream = file.createReadStream();
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(res);
  });
  return true;
}
