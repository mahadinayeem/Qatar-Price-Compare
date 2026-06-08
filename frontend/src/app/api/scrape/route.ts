import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Global in-memory lock to prevent concurrent runs
let isScrapingInProgress = false;

export async function POST(req: NextRequest) {
  if (isScrapingInProgress) {
    return NextResponse.json(
      { error: "Scrape is already in progress. Please wait." },
      { status: 409 }
    );
  }

  isScrapingInProgress = true;

  try {
    const scraperDir = path.join(process.cwd(), "..", "scraper");
    const dbPath = path.resolve(process.cwd(), "data", "products.db");

    // Spawn python main.py in the scraper folder with absolute DATABASE_PATH
    const child = spawn("python", ["main.py"], {
      cwd: scraperDir,
      shell: true,
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
      },
    });

    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const code = await new Promise<number>((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });

    if (code !== 0) {
      console.error(`Scraper exited with code ${code}. Stderr: ${stderr}`);
      return NextResponse.json(
        { error: "Scraper execution failed", details: stderr },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Scrape API error:", err);
    return NextResponse.json(
      { error: "Failed to trigger scraper", details: err?.message },
      { status: 500 }
    );
  } finally {
    isScrapingInProgress = false;
  }
}
