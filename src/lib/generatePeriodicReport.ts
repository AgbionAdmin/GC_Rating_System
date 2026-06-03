import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GCRow } from '../screens/GCDashboard';

// Score → RGB color (mirrors dashboard green/yellow/red)
function scoreColor(v: number): [number, number, number] {
  if (v >= 3.5) return [74, 222, 128];   // green-400
  if (v >= 2.0) return [250, 204, 21];   // yellow-400
  return [248, 113, 113];                 // red-400
}

function fmtScore(v: number | null): string {
  if (v == null || v === 0) return '—';
  return v.toFixed(1);
}

export function generatePeriodicReport(rows: GCRow[]): void {
  const eligible = rows
    .filter((r) => r.rating_count > 0 && r.overall_score != null)
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ── Header background ───────────────────────────────────────────────────
  doc.setFillColor(18, 35, 51);
  doc.rect(0, 0, pageW, 72, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('GC Performance Report', margin, 30);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 220);
  doc.text('All-time data · Ranked by Overall Score (highest to lowest)', margin, 46);

  // Date (right-aligned)
  doc.setFontSize(9);
  doc.setTextColor(140, 165, 190);
  doc.text(`Generated ${dateStr}`, pageW - margin, 30, { align: 'right' });

  // GC count
  doc.setFontSize(9);
  doc.text(
    `${eligible.length} contractor${eligible.length !== 1 ? 's' : ''} with PM reports`,
    pageW - margin, 46, { align: 'right' },
  );

  // Score key strip
  doc.setFillColor(24, 44, 64);
  doc.rect(0, 72, pageW, 20, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 165, 190);
  const keyItems: [string, [number, number, number]][] = [
    ['Score key:', [140, 165, 190]],
    ['4.0 – 5.0  Excellent', [74, 222, 128]],
    ['2.5 – 3.9  Satisfactory', [250, 204, 21]],
    ['1.0 – 2.4  Poor', [248, 113, 113]],
    ['—  No data', [120, 140, 160]],
  ];
  let kx = margin;
  for (const [text, color] of keyItems) {
    doc.setTextColor(...color);
    doc.text(text, kx, 85);
    kx += doc.getTextWidth(text) + 18;
  }

  // ── Table ────────────────────────────────────────────────────────────────
  const top5Ids = new Set(eligible.slice(0, 5).map((r) => r.id));

  const COLS = [
    { header: 'Rank', key: null as null },
    { header: 'GC Name', key: null as null },
    { header: 'Overall', key: 'overall_score' as keyof GCRow },
    { header: 'Payment', key: 'payment_timeline' as keyof GCRow },
    { header: 'CO Appr.', key: 'co_approval_timeline' as keyof GCRow },
    { header: 'CO Neg.', key: 'co_negotiations' as keyof GCRow },
    { header: 'Contract', key: 'contract_terms' as keyof GCRow },
    { header: 'Conflict', key: 'conflict_mitigation' as keyof GCRow },
    { header: 'Stacking', key: 'schedule_trade_stacking' as keyof GCRow },
    { header: 'Accuracy', key: 'schedule_accuracy' as keyof GCRow },
    { header: 'Site', key: 'site_control' as keyof GCRow },
    { header: 'PM Rel.', key: 'relationship' as keyof GCRow },
    { header: 'Est Rel.', key: 'est_relationship' as keyof GCRow },
    { header: 'Bids', key: 'total_bids' as keyof GCRow },
    { header: 'Hit Rate ($)', key: 'hit_rate_dollar_score' as keyof GCRow },
    { header: '# Reports', key: 'rating_count' as keyof GCRow },
  ];

  const bodyData = eligible.map((row, idx) => [
    String(idx + 1),
    row.name,
    ...COLS.slice(2).map((c) => fmtScore(row[c.key!] as number | null)),
  ]);

  autoTable(doc, {
    startY: 96,
    head: [COLS.map((c) => c.header)],
    body: bodyData,
    margin: { left: margin, right: margin },
    tableWidth: pageW - margin * 2,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      font: 'helvetica',
      textColor: [220, 235, 250],
      fillColor: [22, 38, 56],
      lineColor: [40, 62, 88],
      lineWidth: 0.5,
      halign: 'center',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [18, 35, 51],
      textColor: [140, 165, 190],
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [26, 44, 64],
    },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: 130, halign: 'left', fontStyle: 'normal' },
    },
    didParseCell(data) {
      if (data.section === 'body') {
        const row = eligible[data.row.index];
        const isTop5 = top5Ids.has(row.id);

        if (isTop5) {
          data.cell.styles.fillColor = [28, 52, 76];
        }

        if (data.column.index >= 2 && data.cell.text[0] !== '—') {
          const v = parseFloat(data.cell.text[0]);
          if (!isNaN(v)) {
            const [r, g, b] = scoreColor(v);
            data.cell.styles.textColor = [r, g, b];
            data.cell.styles.fontStyle = 'bold';
          }
        }

        if (data.column.index === 1 && isTop5) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [255, 255, 255];
        }
      }
    },
    didDrawPage(hookData) {
      const pageNum = (hookData.pageNumber as number);
      const totalPages = (doc.internal as { getNumberOfPages(): number }).getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(100, 130, 160);
      doc.text(`Page ${pageNum} of ${totalPages}`, pageW / 2, pageH - 14, { align: 'center' });
      doc.text('Internal Use Only', margin, pageH - 14);
    },
  });

  // ── "View online" block on last page ─────────────────────────────────────
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const blockTop = finalY + 18;
  const blockH = 32;
  const blockX = pageW / 2 - 140;
  const blockW = 280;

  // Subtle background pill
  doc.setFillColor(22, 38, 56);
  doc.setDrawColor(50, 80, 115);
  doc.setLineWidth(0.5);
  doc.roundedRect(blockX, blockTop, blockW, blockH, 4, 4, 'FD');

  // Label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 150, 180);
  doc.text('View live data & full contractor profiles at', pageW / 2, blockTop + 12, { align: 'center' });

  // Link — slightly larger, blue, underlined
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80, 150, 220);
  const linkText = 'gc-rating-project.vercel.app';
  const linkX = pageW / 2 - doc.getTextWidth(linkText) / 2;
  const linkY = blockTop + 24;
  doc.textWithLink(linkText, pageW / 2, linkY, { align: 'center', url: 'https://gc-rating-project.vercel.app/' });
  // Underline
  doc.setDrawColor(80, 150, 220);
  doc.setLineWidth(0.4);
  doc.line(linkX, linkY + 1.5, linkX + doc.getTextWidth(linkText), linkY + 1.5);

  const fileName = `GC-Performance-Report-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
