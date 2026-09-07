import { NextResponse } from "next/server";

const PIN_FILE = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function gateway(cid: string): string {
  const base = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";
  return `${base.replace(/\/$/, "")}/ipfs/${cid}`;
}

async function pinFile(file: File, jwt: string): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(PIN_FILE, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  });
  if (!response.ok) throw new Error(`Image upload failed: ${await response.text()}`);
  const { IpfsHash } = (await response.json()) as { IpfsHash: string };
  return IpfsHash;
}

async function pinJson(payload: unknown, jwt: string): Promise<string> {
  const response = await fetch(PIN_JSON, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ pinataContent: payload }),
  });
  if (!response.ok) throw new Error(`Metadata upload failed: ${await response.text()}`);
  const { IpfsHash } = (await response.json()) as { IpfsHash: string };
  return IpfsHash;
}

/**
 * Uploads the token image and builds the off-chain metadata JSON that the
 * on-chain metadata `uri` points at. Wallets and explorers read this file for
 * the name, logo and socials.
 */
export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      {
        error:
          "PINATA_JWT is not set. Add it in your environment, or paste an existing metadata URI on the launch form instead.",
      },
      { status: 501 },
    );
  }

  const form = await request.formData();
  const image = form.get("image");
  const name = String(form.get("name") ?? "").trim();
  const symbol = String(form.get("symbol") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const website = String(form.get("website") ?? "").trim();
  const twitter = String(form.get("twitter") ?? "").trim();
  const telegram = String(form.get("telegram") ?? "").trim();

  if (!name || !symbol) {
    return NextResponse.json({ error: "Name and symbol are required." }, { status: 400 });
  }
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "An image file is required." }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }
  if (!image.type.startsWith("image/")) {
    return NextResponse.json({ error: "That file is not an image." }, { status: 400 });
  }

  try {
    const imageUri = gateway(await pinFile(image, jwt));
    const metadataCid = await pinJson(
      {
        name,
        symbol,
        description,
        image: imageUri,
        external_url: website || undefined,
        extensions: {
          website: website || undefined,
          twitter: twitter || undefined,
          telegram: telegram || undefined,
        },
        properties: {
          files: [{ uri: imageUri, type: image.type }],
          category: "image",
        },
      },
      jwt,
    );
    return NextResponse.json({ imageUri, metadataUri: gateway(metadataCid) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 502 },
    );
  }
}
