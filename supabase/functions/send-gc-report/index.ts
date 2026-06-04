import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import jsPDF from "npm:jspdf@2";
import autoTable from "npm:jspdf-autotable@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_ADDRESS = "Legacy Mechanical <reports@legacymechanical.com>";
const DASHBOARD_URL = "https://gc-rating-project.vercel.app/";

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number): [number, number, number] {
  if (v >= 3.5) return [74, 222, 128];
  if (v >= 2.0) return [250, 204, 21];
  return [248, 113, 113];
}

function fmtScore(v: number | null): string {
  if (v == null || v === 0) return "—";
  return v.toFixed(1);
}

function intervalDays(frequency: string): number {
  if (frequency === "weekly") return 7;
  if (frequency === "biweekly") return 14;
  return 30;
}

// ── PDF generation (mirrors generatePeriodicReport.ts logic) ────────────────

function buildPdf(rows: Record<string, unknown>[]): Uint8Array {
  const eligible = rows
    .filter((r) => Number(r.rating_count) > 0 && r.overall_score != null)
    .sort((a, b) => (Number(b.overall_score) || 0) - (Number(a.overall_score) || 0));

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  doc.setFillColor(18, 35, 51);
  doc.rect(0, 0, pageW, 72, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("GC Performance Report", margin, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 220);
  doc.text("All-time data · Ranked by Overall Score (highest to lowest)", margin, 46);

  doc.setFontSize(9);
  doc.setTextColor(140, 165, 190);
  doc.text(`Generated ${dateStr}`, pageW - margin, 30, { align: "right" });
  doc.text(
    `${eligible.length} contractor${eligible.length !== 1 ? "s" : ""} with PM reports`,
    pageW - margin, 46, { align: "right" },
  );

  doc.setFillColor(24, 44, 64);
  doc.rect(0, 72, pageW, 20, "F");
  doc.setFontSize(7.5);
  const keyItems: [string, [number, number, number]][] = [
    ["Score key:", [140, 165, 190]],
    ["4.0 – 5.0  Excellent", [74, 222, 128]],
    ["2.5 – 3.9  Satisfactory", [250, 204, 21]],
    ["1.0 – 2.4  Poor", [248, 113, 113]],
    ["—  No data", [120, 140, 160]],
  ];
  let kx = margin;
  for (const [text, color] of keyItems) {
    doc.setTextColor(...color);
    doc.text(text, kx, 85);
    kx += doc.getTextWidth(text) + 18;
  }

  const COLS = [
    "Rank", "GC Name", "Overall", "Payment", "CO Appr.", "CO Neg.",
    "Contract", "Conflict", "Stacking", "Accuracy", "Site", "PM Rel.",
    "Est Rel.", "Bids", "Hit Rate ($)", "# Reports",
  ];

  const KEYS = [
    null, null, "overall_score", "payment_timeline", "co_approval_timeline",
    "co_negotiations", "contract_terms", "conflict_mitigation",
    "schedule_trade_stacking", "schedule_accuracy", "site_control",
    "relationship", "est_relationship", "total_bids", "hit_rate_dollar_score",
    "rating_count",
  ] as (string | null)[];

  const top5Ids = new Set(eligible.slice(0, 5).map((r) => r.id));

  const bodyData = eligible.map((row, idx) => [
    String(idx + 1),
    String(row.name),
    ...KEYS.slice(2).map((k) => fmtScore(k ? (row[k] as number | null) : null)),
  ]);

  autoTable(doc, {
    startY: 96,
    head: [COLS],
    body: bodyData,
    margin: { left: margin, right: margin },
    tableWidth: pageW - margin * 2,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      font: "helvetica",
      textColor: [220, 235, 250],
      fillColor: [22, 38, 56],
      lineColor: [40, 62, 88],
      lineWidth: 0.5,
      halign: "center",
      valign: "middle",
    },
    headStyles: {
      fillColor: [18, 35, 51],
      textColor: [140, 165, 190],
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [26, 44, 64] },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 130, halign: "left", fontStyle: "normal" },
    },
    didParseCell(data) {
      if (data.section === "body") {
        const row = eligible[data.row.index];
        const isTop5 = top5Ids.has(row.id);
        if (isTop5) data.cell.styles.fillColor = [28, 52, 76];
        if (data.column.index >= 2 && data.cell.text[0] !== "—") {
          const v = parseFloat(data.cell.text[0]);
          if (!isNaN(v)) {
            const [r, g, b] = scoreColor(v);
            data.cell.styles.textColor = [r, g, b];
            data.cell.styles.fontStyle = "bold";
          }
        }
        if (data.column.index === 1 && isTop5) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [255, 255, 255];
        }
      }
    },
    didDrawPage(hookData) {
      const pageNum = hookData.pageNumber as number;
      const totalPages = (doc.internal as { getNumberOfPages(): number }).getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(100, 130, 160);
      doc.text(`Page ${pageNum} of ${totalPages}`, pageW / 2, pageH - 14, { align: "center" });
      doc.text("Confidential — Internal Use Only", margin, pageH - 14);
    },
  });

  // "View online" block on last page
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const blockTop = finalY + 18;
  const blockH = 32;
  const blockX = pageW / 2 - 140;
  const blockW = 280;

  doc.setFillColor(22, 38, 56);
  doc.setDrawColor(50, 80, 115);
  doc.setLineWidth(0.5);
  doc.roundedRect(blockX, blockTop, blockW, blockH, 4, 4, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 150, 180);
  doc.text("View live data & full contractor profiles at", pageW / 2, blockTop + 12, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 150, 220);
  const linkText = "gc-rating-project.vercel.app";
  const linkX = pageW / 2 - doc.getTextWidth(linkText) / 2;
  const linkY = blockTop + 24;
  doc.textWithLink(linkText, pageW / 2, linkY, { align: "center", url: DASHBOARD_URL });
  doc.setDrawColor(80, 150, 220);
  doc.setLineWidth(0.4);
  doc.line(linkX, linkY + 1.5, linkX + doc.getTextWidth(linkText), linkY + 1.5);

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

// ── Email ────────────────────────────────────────────────────────────────────

async function sendEmail(to: string, pdfBytes: Uint8Array, dateStr: string): Promise<boolean> {
  const base64Pdf = btoa(String.fromCharCode(...pdfBytes));
  const body = {
    from: FROM_ADDRESS,
    to,
    subject: `GC Performance Report — ${dateStr}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#334155;">
        <div style="background:#122333;padding:28px 32px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">GC Performance Report</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${dateStr}</p>
        </div>
        <div style="background:#f8fafc;padding:28px 32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
            Please find attached the latest GC Performance Report from Legacy Mechanical. This report
            summarizes current performance ratings for all general contractors across key categories
            including payment timelines, change order management, scheduling, and site control.
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
            Contractors are ranked by overall score, with the top five highlighted. Scores reflect
            all PM evaluations submitted to date.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
            For the full interactive view — including individual contractor profiles, detailed ratings
            by project, and up-to-date data — visit the dashboard:
          </p>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${DASHBOARD_URL}"
               style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
                      padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
              View Dashboard
            </a>
          </div>
          <p style="margin:0;font-size:13px;color:#94a3b8;">
            This report is intended for internal use only. If you have questions or would like to be
            removed from this distribution list, please contact your Legacy Mechanical project manager.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `GC-Performance-Report-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: base64Pdf,
      },
    ],
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Load settings
    const { data: settings } = await db
      .from("report_settings")
      .select("frequency, last_sent_at")
      .eq("id", 1)
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ skipped: true, reason: "no settings row" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if it's time to send (skip check when force=true)
    if (!force && settings.last_sent_at) {
      const daysSince =
        (Date.now() - new Date(settings.last_sent_at).getTime()) / 86_400_000;
      const required = intervalDays(settings.frequency);
      if (daysSince < required) {
        return new Response(
          JSON.stringify({ skipped: true, reason: `${Math.round(required - daysSince)} days until next send` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Load subscribers
    const { data: subscribers } = await db
      .from("report_subscribers")
      .select("email");

    if (!subscribers || subscribers.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no subscribers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load GC data
    const { data: gcData } = await db.from("general_contractors").select("*");
    const { data: ratingsData } = await db.from("ratings").select("*");

    if (!gcData || !ratingsData) {
      return new Response(JSON.stringify({ error: "failed to load GC data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build aggregated rows (mirrors client-side logic)
    const ratingsByGC = new Map<string, typeof ratingsData>();
    for (const r of ratingsData) {
      if (!ratingsByGC.has(r.gc_id)) ratingsByGC.set(r.gc_id, []);
      ratingsByGC.get(r.gc_id)!.push(r);
    }

    const SCORE_KEYS = [
      "payment_timeline", "co_approval_timeline", "co_negotiations",
      "contract_terms", "conflict_mitigation", "schedule_trade_stacking",
      "schedule_accuracy", "site_control", "relationship",
    ];

    const rows = gcData.map((gc) => {
      const gcRatings = ratingsByGC.get(gc.id) ?? [];
      if (gcRatings.length === 0) {
        return {
          id: gc.id, name: gc.name, rating_count: 0,
          overall_score: null, hit_rate_dollar_score: null,
          est_relationship: null, total_bids: null,
          payment_timeline: 0, co_approval_timeline: 0, co_negotiations: 0,
          contract_terms: 0, conflict_mitigation: 0, schedule_trade_stacking: 0,
          schedule_accuracy: 0, site_control: 0, relationship: 0,
        };
      }
      const avg = (key: string) => {
        const vals = gcRatings.map((r) => r[key]).filter((v) => v != null) as number[];
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const categoryAvgs = Object.fromEntries(SCORE_KEYS.map((k) => [k, avg(k)]));
      const scoredKeys = [...SCORE_KEYS];
      const estRel = gc.est_relationship != null ? Number(gc.est_relationship) : null;
      if (estRel != null) scoredKeys.push("est_relationship_computed");
      const hitRateScore = gc.hit_rate_dollar != null
        ? Math.min(5, Math.max(1, Number(gc.hit_rate_dollar) * 5))
        : null;

      const allScores = [
        ...SCORE_KEYS.map((k) => categoryAvgs[k]),
        ...(estRel != null ? [estRel] : []),
        ...(hitRateScore != null ? [hitRateScore] : []),
      ].filter((v) => v > 0);

      const overall = allScores.length
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : null;

      return {
        id: gc.id, name: gc.name,
        ...categoryAvgs,
        est_relationship: estRel,
        hit_rate_dollar_score: hitRateScore,
        total_bids: gc.total_bids != null ? Number(gc.total_bids) : null,
        overall_score: overall,
        rating_count: gcRatings.length,
      };
    });

    // Generate PDF
    const pdfBytes = buildPdf(rows);
    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    // Send to each subscriber
    const results = await Promise.all(
      subscribers.map((s) => sendEmail(s.email, pdfBytes, dateStr)),
    );
    const sent = results.filter(Boolean).length;

    // Update last_sent_at
    await db
      .from("report_settings")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("id", 1);

    return new Response(
      JSON.stringify({ sent, total: subscribers.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
