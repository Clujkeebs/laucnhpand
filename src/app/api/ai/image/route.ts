import { NextResponse } from "next/server";
import { ImageError, generateImage, imageProviderLabel } from "@/lib/image";

export const maxDuration = 120;

export async function POST(request: Request) {
  let subject = "";
  try {
    ({ subject } = (await request.json()) as { subject: string });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const trimmed = (subject ?? "").trim();
  if (trimmed.length < 2) {
    return NextResponse.json({ error: "Describe the image first." }, { status: 400 });
  }
  if (trimmed.length > 500) {
    return NextResponse.json({ error: "Keep the description under 500 characters." }, { status: 400 });
  }

  try {
    const bytes = await generateImage(trimmed);
    return NextResponse.json({
      dataUri: `data:image/png;base64,${bytes.toString("base64")}`,
      provider: imageProviderLabel(),
    });
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Image generation failed." }, { status: 502 });
  }
}
