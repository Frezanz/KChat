import { NextResponse } from "next/server";
import { TOOL_DEFINITIONS, OPENAI_FUNCTION_TOOLS } from "@/lib/tool-registry";
export async function GET() { return NextResponse.json({ tools: TOOL_DEFINITIONS, openai: OPENAI_FUNCTION_TOOLS }); }
