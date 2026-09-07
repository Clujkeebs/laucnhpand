import { NextResponse } from "next/server";
import { providerLabel } from "@/lib/llm";

/**
 * Reports which environment variables are present, never their values. Lets you
 * confirm a deploy picked up its configuration without opening the dashboard.
 */
export async function GET() {
  const present = (name: string) => Boolean(process.env[name]);

  return NextResponse.json({
    required: {
      APP_PASSWORD: present("APP_PASSWORD"),
      AUTH_SECRET: present("AUTH_SECRET"),
    },
    assistant: {
      OPENROUTER_API_KEY: present("OPENROUTER_API_KEY"),
      OPENROUTER_MODEL: present("OPENROUTER_MODEL"),
      ANTHROPIC_API_KEY: present("ANTHROPIC_API_KEY"),
      active: providerLabel(),
    },
    network: {
      NEXT_PUBLIC_MAINNET_RPC: present("NEXT_PUBLIC_MAINNET_RPC"),
      NEXT_PUBLIC_DEVNET_RPC: present("NEXT_PUBLIC_DEVNET_RPC"),
    },
    uploads: {
      PINATA_JWT: present("PINATA_JWT"),
      NEXT_PUBLIC_PINATA_GATEWAY: present("NEXT_PUBLIC_PINATA_GATEWAY"),
    },
  });
}
