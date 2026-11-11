import PDFDocument from 'pdfkit';
import { formatMoney, formatPhoneSG, isoToDisplay, type Quotation } from '@mybusiness/shared';
import type { Business } from '../business/repo.js';

// A4 quotation PDF in the approved design's colours. Uses the built-in Helvetica font: no font files needed.
const C = { accent: '#0F766E', ink: '#111827', ink2: '#344054', ink3: '#5B6474', line: '#E4E7EC', head: '#F7F8FA' };
const M = 48; // page margin
const W = 595.28 - M * 2; // content width
const money = (cents: number) => formatMoney(cents / 100);
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

export function renderQuotationPdf(q: Quotation, biz: Business): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Quotation ${q.number}`, Author: biz.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Header: business on the left, QUOTATION on the right.
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(16).text(biz.name, M, M, { width: W * 0.6 });
  doc.fillColor(C.ink).fontSize(20).text('QUOTATION', M, M, { width: W, align: 'right' });
  doc.moveDown(0.3);
  const bizLines = [
    [biz.uen ? `UEN ${biz.uen}` : null, biz.gstRegistered && biz.gstRegNo ? `GST Reg. No. ${biz.gstRegNo}` : null].filter(Boolean).join('  ·  '),
    biz.address,
    [biz.phone ? formatPhoneSG(biz.phone) : null, biz.email].filter(Boolean).join('  ·  '),
  ].filter((l): l is string => !!l);
  doc.font('Helvetica').fontSize(9).fillColor(C.ink3);
  let y = M + 24;
  for (const line of bizLines) {
    doc.text(line, M, y, { width: W * 0.6 });
    y = doc.y + 1;
  }
  y = Math.max(y, M + 60) + 14;
  doc.moveTo(M, y).lineTo(M + W, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 16;

  // Bill to + quotation details.
  const top = y;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink3).text('BILL TO', M, y);
  y += 13;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(q.customer.name, M, y, { width: W * 0.55 });
  y = doc.y + 2;
  doc.font('Helvetica').fontSize(9.5).fillColor(C.ink2);
  const custLines = [
    q.customer.company,
    [q.customer.address, q.customer.postalCode ? `Singapore ${q.customer.postalCode}` : null].filter(Boolean).join(', ') || null,
    q.customer.phone ? formatPhoneSG(q.customer.phone) : null,
    q.customer.email,
  ].filter((l): l is string => !!l);
  for (const line of custLines) {
    doc.text(line, M, y, { width: W * 0.55 });
    y = doc.y + 1;
  }
  const meta: [string, string][] = [
    ['Quotation no.', q.number],
    ['Issue date', isoToDisplay(q.issueDate)],
    ['Valid until', isoToDisplay(q.validUntil)],
  ];
  let my = top;
  for (const [k, v] of meta) {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink3).text(k, M + W * 0.6, my, { width: W * 0.2 });
    doc.font('Helvetica-Bold').fillColor(C.ink).text(v, M + W * 0.8, my, { width: W * 0.2, align: 'right' });
    my += 16;
  }
  y = Math.max(y, my) + 18;

  if (q.title) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(q.title, M, y, { width: W });
    y = doc.y + 12;
  }

  // Line items table.
  const col = { n: M, svc: M + 24, qty: M + W - 210, price: M + W - 150, amt: M + W - 80 };
  const svcW = col.qty - col.svc - 10;
  const header = () => {
    doc.rect(M, y, W, 22).fill(C.head);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink3);
    doc.text('#', col.n + 6, y + 7);
    doc.text('SERVICE', col.svc, y + 7);
    doc.text('QTY', col.qty, y + 7, { width: 50, align: 'right' });
    doc.text('UNIT PRICE', col.price, y + 7, { width: 65, align: 'right' });
    doc.text('AMOUNT', col.amt, y + 7, { width: 80, align: 'right' });
    y += 22;
  };
  header();
  const bottom = 842 - M - 40;
  q.items.forEach((item, idx) => {
    doc.font('Helvetica-Bold').fontSize(10);
    const h1 = doc.heightOfString(item.service, { width: svcW });
    doc.font('Helvetica').fontSize(9);
    const h2 = item.description ? doc.heightOfString(item.description, { width: svcW }) + 2 : 0;
    const rowH = Math.max(h1 + h2, 12) + 14;
    if (y + rowH > bottom) {
      doc.addPage();
      y = M;
      header();
    }
    const ty = y + 7;
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink3).text(String(idx + 1), col.n + 6, ty);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(item.service, col.svc, ty, { width: svcW });
    if (item.description) doc.font('Helvetica').fontSize(9).fillColor(C.ink3).text(item.description, col.svc, ty + h1 + 2, { width: svcW });
    doc.font('Helvetica').fontSize(10).fillColor(C.ink2);
    doc.text(qty(item.quantity), col.qty, ty, { width: 50, align: 'right' });
    doc.text(money(item.unitPriceCents), col.price, ty, { width: 65, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(C.ink).text(money(item.amountCents), col.amt, ty, { width: 80, align: 'right' });
    y += rowH;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(C.line).lineWidth(0.75).stroke();
  });

  // Totals.
  const rows: [string, string, boolean?][] = [['Subtotal', money(q.subtotalCents)]];
  if (q.discountCents > 0) rows.push([`Discount (${pct(q.discountBp)})`, `-${money(q.discountCents)}`]);
  if (q.gstRegistered) rows.push([`GST ${pct(q.gstRateBp)}`, money(q.gstCents)]);
  rows.push([q.gstRegistered ? 'Total incl. GST (SGD)' : 'Total (SGD)', money(q.totalCents), true]);
  if (y + rows.length * 20 + 30 > bottom) {
    doc.addPage();
    y = M;
  }
  y += 14;
  const tx = M + W - 240;
  for (const [k, v, strong] of rows) {
    if (strong) {
      doc.moveTo(tx, y - 4).lineTo(M + W, y - 4).strokeColor(C.ink).lineWidth(1).stroke();
      y += 4;
    }
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 12 : 10).fillColor(strong ? C.ink : C.ink2);
    doc.text(k, tx, y, { width: 140 });
    doc.text(v, tx + 140, y, { width: 100, align: 'right' });
    y += strong ? 22 : 18;
  }

  // Notes & terms.
  if (q.notes) {
    y += 16;
    doc.font('Helvetica').fontSize(9.5);
    const nh = doc.heightOfString(q.notes, { width: W });
    if (y + nh + 20 > bottom) {
      doc.addPage();
      y = M;
    }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink3).text('NOTES & TERMS', M, y);
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink2).text(q.notes, M, y + 13, { width: W, lineGap: 2 });
  }

  // Footer on every page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The footer sits inside the bottom margin; without this PDFKit would start a new page for it.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(C.ink3);
    doc.text(`${biz.name} · ${q.number}`, M, 842 - 32, { width: W / 2, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, M + W / 2, 842 - 32, { width: W / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
