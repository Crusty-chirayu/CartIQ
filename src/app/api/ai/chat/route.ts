import { NextRequest, NextResponse } from "next/server";
import { processUserMessage } from "@/lib/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const {
      sessionId,
      message,
    } = await req.json();

    if (!sessionId || !message) {
      return NextResponse.json(
        {
          error: "sessionId and message are required.",
        },
        {
          status: 400,
        }
      );
    }

    const response = await processUserMessage(
      sessionId,
      message
    );

    // API/client boundary validation: never emit a malformed AI message.
    // Every ChatMessage requires a non-empty string `content` mapped from
    // `message`; anything else becomes an explicit, catchable error.
    if (
      !response ||
      typeof response !== "object" ||
      typeof (response as { message?: unknown }).message !== "string" ||
      !(response as { message: string }).message.trim()
    ) {
      console.error("AI Chat API: malformed orchestrator response:", response);

      return NextResponse.json(
        {
          error: "AI assistant returned an invalid response. Please try again.",
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json(response);

  } catch (error) {

    console.error("AI Chat API Error:", error);

    // Surface real provider failures with a safe, meaningful message and an
    // appropriate status instead of flattening everything to a generic 500.
    // Only the provider's public error message is forwarded — never keys or
    // credentials.
    const providerError = error as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
      error?: { message?: unknown; code?: unknown };
    };

    const statusValue =
      typeof providerError?.status === "number"
        ? providerError.status
        : typeof providerError?.error?.code === "number"
          ? providerError.error.code
          : typeof providerError?.code === "number"
            ? providerError.code
            : 500;

    const providerMessage =
      typeof providerError?.error?.message === "string" &&
      providerError.error.message.trim()
        ? providerError.error.message
        : typeof providerError?.message === "string" &&
            providerError.message.trim()
          ? providerError.message
          : "";

    if (statusValue === 402) {
      return NextResponse.json(
        {
          error:
            providerMessage ||
            "CartIQ AI is out of OpenRouter credits. Please add credits at https://openrouter.ai/settings/credits and try again.",
        },
        {
          status: 402,
        }
      );
    }

    if (statusValue === 401 || statusValue === 403) {
      return NextResponse.json(
        {
          error:
            "CartIQ AI authentication failed. Please check the AI provider configuration and try again.",
        },
        {
          status: 502,
        }
      );
    }

    if (statusValue === 429) {
      return NextResponse.json(
        {
          error:
            providerMessage ||
            "CartIQ AI is rate-limited right now. Please wait a moment and try again.",
        },
        {
          status: 429,
        }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      {
        status: 500,
      }
    );

  }
}   