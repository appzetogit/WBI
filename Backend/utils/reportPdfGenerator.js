const PDFDocument = require('pdfkit');

/**
 * Draw a structured table in PDFKit
 */
const drawTable = (doc, startX, startY, columns, rows) => {
  const cellPadding = 6;
  const fontSize = 8;
  const headerHeight = 22;
  const rowHeight = 20;

  // Draw Header Background
  doc.fillColor('#F1F5F9')
     .rect(startX, startY, columns.reduce((acc, col) => acc + col.width, 0), headerHeight)
     .fill();

  // Print Header Labels
  doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#475569');
  let currentX = startX;
  columns.forEach(col => {
    const align = col.align || 'left';
    doc.text(col.label, currentX + cellPadding, startY + cellPadding, {
      width: col.width - (cellPadding * 2),
      align
    });
    currentX += col.width;
  });

  // Draw rows
  let currentY = startY + headerHeight;
  doc.font('Helvetica').fillColor('#1E293B');

  rows.forEach((row, rowIndex) => {
    // Alternating rows bg
    if (rowIndex % 2 === 1) {
      doc.fillColor('#F8FAFC')
         .rect(startX, currentY, columns.reduce((acc, col) => acc + col.width, 0), rowHeight)
         .fill();
    }

    doc.fillColor('#E2E8F0')
       .moveTo(startX, currentY + rowHeight)
       .lineTo(startX + columns.reduce((acc, col) => acc + col.width, 0), currentY + rowHeight)
       .stroke();

    let rowX = startX;
    columns.forEach(col => {
      const value = String(row[col.key] || '');
      const align = col.align || 'left';
      
      doc.fillColor('#1E293B');
      if (col.key === 'completionRate' || col.key === 'averageRating') {
        doc.font('Helvetica-Bold');
      } else {
        doc.font('Helvetica');
      }

      doc.text(value, rowX + cellPadding, currentY + cellPadding - 1, {
        width: col.width - (cellPadding * 2),
        align
      });
      rowX += col.width;
    });

    currentY += rowHeight;
  });

  return currentY;
};

/**
 * Generate a PDF stream containing structured report data
 */
const generateReportPdf = (company, summary, servicePerformance, engineerPerformance, expenseSummary, filters) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  // Main Colors
  const brandTeal = '#10AFA5';
  const textDark = '#1E293B';
  const textMuted = '#64748B';

  // --- Header Block ---
  doc.fillColor(brandTeal).fontSize(24).font('Helvetica-Bold').text('WBI', 40, 40);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(textMuted).text('B2B SERVICE PLATFORM', 40, 65);

  doc.fontSize(14).font('Helvetica-Bold').fillColor(textDark).text('B2B Operational Performance Report', 180, 40, { align: 'right' });
  
  const dateRangeStr = (filters.startDate && filters.endDate)
    ? `${new Date(filters.startDate).toLocaleDateString('en-IN')} to ${new Date(filters.endDate).toLocaleDateString('en-IN')}`
    : 'All Time';

  doc.fontSize(8).font('Helvetica').fillColor(textMuted)
     .text(`Date Range: ${dateRangeStr}`, 180, 58, { align: 'right' })
     .text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 180, 70, { align: 'right' });

  // Divider Line
  doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, 85).lineTo(555, 85).stroke();

  // --- Company Snapshots ---
  doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark).text('Company Details', 40, 100);
  doc.fontSize(8).font('Helvetica').fillColor(textMuted)
     .text(`Company Name: ${company.companyName}`, 40, 115)
     .text(`GSTIN: ${company.gstNumber || 'N/A'}`, 40, 127)
     .text(`Email: ${company.email}`, 40, 139)
     .text(`Billing Address: ${company.billingAddress || company.companyAddress || 'N/A'}`, 40, 151, { width: 400 });

  // --- Section 1: Summary Cards (Grid) ---
  doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark).text('Performance Highlights', 40, 185);

  const cardWidth = 158;
  const cardHeight = 52;
  const startX = 40;
  const startY = 200;

  const cards = [
    { label: 'Total Jobs', val: summary.totalJobs.value, change: summary.totalJobs.changeText },
    { label: 'Completed Jobs', val: summary.completedJobs.value, change: summary.completedJobs.changeText },
    { label: 'Pending Jobs', val: summary.pendingJobs.value, change: summary.pendingJobs.changeText },
    { label: 'Cancelled Jobs', val: summary.cancelledJobs.value, change: summary.cancelledJobs.changeText },
    { label: 'Total Spend (INR)', val: `₹${summary.totalSpend.value.toLocaleString('en-IN')}`, change: summary.totalSpend.changeText },
    { label: 'Average Rating', val: `${summary.averageRating.value} / 5`, change: summary.averageRating.changeText }
  ];

  cards.forEach((card, idx) => {
    const colIdx = idx % 3;
    const rowIdx = Math.floor(idx / 3);
    const boxX = startX + (colIdx * (cardWidth + 15));
    const boxY = startY + (rowIdx * (cardHeight + 15));

    // Draw Light grey background box
    doc.fillColor('#F8FAFC')
       .rect(boxX, boxY, cardWidth, cardHeight)
       .fill();
    
    // Draw Thin border
    doc.strokeColor('#E2E8F0')
       .lineWidth(1)
       .rect(boxX, boxY, cardWidth, cardHeight)
       .stroke();

    // Print label
    doc.fontSize(7).font('Helvetica-Bold').fillColor(textMuted).text(card.label.toUpperCase(), boxX + 8, boxY + 8);
    // Print value
    doc.fontSize(14).font('Helvetica-Bold').fillColor(textDark).text(String(card.val), boxX + 8, boxY + 18);
    
    // MoM text color (green for up, red for down)
    const isUp = card.change.includes('↑');
    const momColor = isUp ? '#10B981' : '#EF4444';
    doc.fontSize(7).font('Helvetica-Bold').fillColor(momColor).text(card.change, boxX + 8, boxY + 36);
  });

  // --- Section 2: Service Performance Table ---
  let nextY = startY + (cardHeight * 2) + 45;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark).text('Service Performance Analysis', 40, nextY);

  const serviceCols = [
    { key: 'serviceName', label: 'Service Name', width: 170 },
    { key: 'totalJobs', label: 'Total Jobs', width: 65, align: 'center' },
    { key: 'completed', label: 'Completed', width: 65, align: 'center' },
    { key: 'pending', label: 'Pending', width: 55, align: 'center' },
    { key: 'completionRate', label: 'Rate', width: 55, align: 'center' },
    { key: 'averageCompletionTime', label: 'Avg Duration', width: 105, align: 'right' }
  ];

  nextY = drawTable(doc, 40, nextY + 15, serviceCols, servicePerformance.slice(0, 10));

  // --- Page Break for Engineer and Expense ---
  doc.addPage();

  // Reset top branding for next pages
  doc.fillColor(brandTeal).fontSize(14).font('Helvetica-Bold').text('WBI Reports', 40, 40);
  doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, 58).lineTo(555, 58).stroke();

  // --- Section 3: Engineer Performance Table ---
  let engY = 75;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark).text('Engineer Performance Statistics', 40, engY);

  const engineerCols = [
    { key: 'engineerName', label: 'Engineer Name', width: 180 },
    { key: 'assignedJobs', label: 'Assigned Jobs', width: 90, align: 'center' },
    { key: 'completedJobs', label: 'Completed Jobs', width: 95, align: 'center' },
    { key: 'activeJobs', label: 'Active Jobs', width: 90, align: 'center' },
    { key: 'averageRating', label: 'Avg Rating', width: 60, align: 'right' }
  ];

  engY = drawTable(doc, 40, engY + 15, engineerCols, engineerPerformance.slice(0, 10));

  // --- Section 4: Expense Summary ---
  let expY = engY + 30;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark).text('Financial & Expense Summary', 40, expY);

  const expBoxWidth = 240;
  const expBoxHeight = 110;
  
  // Left Financial highlights box
  doc.fillColor('#F8FAFC').rect(40, expY + 15, expBoxWidth, expBoxHeight).fill();
  doc.strokeColor('#E2E8F0').lineWidth(1).rect(40, expY + 15, expBoxWidth, expBoxHeight).stroke();

  doc.fontSize(8).font('Helvetica').fillColor(textMuted);
  doc.text('Wallet & Invoice Ledger Overview', 50, expY + 25);

  doc.fontSize(8).font('Helvetica-Bold').fillColor(textDark);
  doc.text(`Total Wallet Recharge:   ₹${expenseSummary.totalWalletRecharge.toLocaleString('en-IN')}`, 50, expY + 45);
  doc.text(`Total Amount Used:      ₹${expenseSummary.totalAmountUsed.toLocaleString('en-IN')}`, 50, expY + 60);
  doc.text(`Total Invoice Amount:    ₹${expenseSummary.totalInvoiceAmount.toLocaleString('en-IN')}`, 50, expY + 75);
  
  doc.fillColor(brandTeal);
  doc.text(`Remaining Balance:      ₹${expenseSummary.totalRemainingWallet.toLocaleString('en-IN')}`, 50, expY + 95);

  // Right Trend block
  doc.fillColor('#F8FAFC').rect(40 + expBoxWidth + 30, expY + 15, expBoxWidth - 30, expBoxHeight).fill();
  doc.strokeColor('#E2E8F0').lineWidth(1).rect(40 + expBoxWidth + 30, expY + 15, expBoxWidth - 30, expBoxHeight).stroke();

  doc.fontSize(8).font('Helvetica').fillColor(textMuted);
  doc.text('Monthly Spend Trend', 40 + expBoxWidth + 40, expY + 25);

  doc.fontSize(8).font('Helvetica').fillColor(textDark);
  let trendY = expY + 45;
  expenseSummary.monthlyExpenseTrend.slice(-4).forEach(t => {
    doc.text(`${t.month}:`, 40 + expBoxWidth + 40, trendY);
    doc.font('Helvetica-Bold').text(`₹${t.amount.toLocaleString('en-IN')}`, 40 + expBoxWidth + 120, trendY);
    doc.font('Helvetica');
    trendY += 15;
  });

  // Footer page numbers
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(textMuted).text(
      `Page ${i + 1} of ${pages.count}  |  System Generated B2B Operational Audit`,
      40, 805, { align: 'center', width: 515 }
    );
  }

  doc.end();
  return doc;
};

module.exports = {
  generateReportPdf
};
