const PDFDocument = require('pdfkit');
const { uploadToCloudinary } = require('./cloudinaryUpload');

/**
 * Generate a beautifully styled PDF buffer for a B2B consolidated invoice using pdfkit.
 */
const generateInvoicePdfBuffer = (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // Brand Color Teal (#10AFA5) and Charcoal Dark (#1E293B)
      const primaryColor = '#10AFA5';
      const darkColor = '#1E293B';
      const lightBg = '#F8FAFC';
      const borderLineColor = '#E2E8F0';

      // ----------------- HEADER SECTION -----------------
      // WBI Logo Title
      doc.fillColor(primaryColor).fontSize(26).font('Helvetica-Bold').text('WBI', 50, 50);
      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('B2B SERVICE PLATFORM', 50, 80);
      
      // Billed By Address info (Left)
      doc.fillColor('#64748B').fontSize(9).font('Helvetica');
      doc.text('WBI Tech Services Private Limited', 50, 100);
      doc.text('GSTIN: 27WBITECH5678A1Z', 50, 112);
      doc.text('Corporate Office: Hiranandani Powai, Mumbai, MH - 400076', 50, 124);
      doc.text('Email: billing@wbi.in | Phone: +91 22 4567 8900', 50, 136);

      // Invoice metadata (Right)
      doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', 350, 50, { align: 'right' });
      
      doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold');
      const metaY = 80;
      doc.text(`Invoice No:`, 350, metaY, { align: 'right' });
      doc.text(`Invoice Date:`, 350, metaY + 12, { align: 'right' });
      doc.text(`Billing Period:`, 350, metaY + 24, { align: 'right' });
      doc.text(`Due Date:`, 350, metaY + 36, { align: 'right' });
      doc.text(`Status:`, 350, metaY + 48, { align: 'right' });

      doc.font('Helvetica');
      doc.text(invoice.invoiceNumber || 'INV-TEMP', 430, metaY, { align: 'right' });
      doc.text(new Date(invoice.invoiceDate || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 430, metaY + 12, { align: 'right' });
      
      let billingPeriodStr = 'N/A';
      if (invoice.billingPeriodStart && invoice.billingPeriodEnd) {
        const startStr = new Date(invoice.billingPeriodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        const endStr = new Date(invoice.billingPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        billingPeriodStr = `${startStr} - ${endStr}`;
      } else if (invoice.billingPeriod) {
        billingPeriodStr = invoice.billingPeriod;
      }
      doc.text(billingPeriodStr, 430, metaY + 24, { align: 'right' });
      doc.text(new Date(invoice.dueDate || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 430, metaY + 36, { align: 'right' });
      
      const invoiceStatus = (invoice.status || 'generated').toUpperCase();
      doc.fillColor(invoiceStatus === 'PAID' || invoiceStatus === 'SETTLED' ? '#16A34A' : '#EA580C')
         .font('Helvetica-Bold')
         .text(invoiceStatus, 430, metaY + 48, { align: 'right' });

      // Horizontal line separator
      doc.strokeColor(borderLineColor).lineWidth(1).moveTo(50, 160).lineTo(545, 160).stroke();

      // ----------------- CLIENT DETAILS SECTION -----------------
      const clientY = 175;
      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('BILLED TO:', 50, clientY);
      
      doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(invoice.companySnapshot?.companyName || 'B2B Client Company', 50, clientY + 15);
      doc.fillColor('#475569').fontSize(9).font('Helvetica');
      doc.text(`GSTIN: ${invoice.companySnapshot?.gstNumber || 'N/A'}`, 50, clientY + 28);
      doc.text(`Email: ${invoice.companySnapshot?.email || 'N/A'} | Phone: ${invoice.companySnapshot?.phone || 'N/A'}`, 50, clientY + 40);
      doc.text(`Address: ${invoice.companySnapshot?.billingAddress || 'N/A'}`, 50, clientY + 52, { width: 495 });

      // Horizontal line separator
      doc.strokeColor(borderLineColor).lineWidth(1).moveTo(50, 245).lineTo(545, 245).stroke();

      // ----------------- BILLING SUMMARY TABLE -----------------
      const tableHeaderY = 260;
      
      // Shaded Header Row Background
      doc.rect(50, tableHeaderY, 495, 20).fill(lightBg);
      
      doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold');
      doc.text('Description', 60, tableHeaderY + 6);
      doc.text('Total Jobs', 250, tableHeaderY + 6, { width: 60, align: 'center' });
      doc.text('Per Job Rate', 320, tableHeaderY + 6, { width: 70, align: 'right' });
      doc.text('Platform Fee', 400, tableHeaderY + 6, { width: 65, align: 'right' });
      doc.text('Total Payable', 475, tableHeaderY + 6, { width: 65, align: 'right' });

      // Border lines for header
      doc.strokeColor(borderLineColor).lineWidth(1)
         .moveTo(50, tableHeaderY).lineTo(545, tableHeaderY).stroke()
         .moveTo(50, tableHeaderY + 20).lineTo(545, tableHeaderY + 20).stroke();

      // Table Row
      const rowY = tableHeaderY + 20;
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica');
      
      // Draw grid lines
      doc.strokeColor(borderLineColor).lineWidth(0.5)
         .moveTo(50, rowY + 30).lineTo(545, rowY + 30).stroke();

      doc.text(`Monthly Consolidate B2B Jobs Execution - ${billingPeriodStr}`, 60, rowY + 10, { width: 180 });
      doc.text(String(invoice.totalJobs || 0), 250, rowY + 10, { width: 60, align: 'center' });
      doc.text(`INR ${(invoice.perJobCharge || 0).toLocaleString('en-IN')}`, 320, rowY + 10, { width: 70, align: 'right' });
      doc.text(`INR ${(invoice.platformFee || 0).toLocaleString('en-IN')}`, 400, rowY + 10, { width: 65, align: 'right' });
      doc.text(`INR ${(invoice.totalAmount || 0).toLocaleString('en-IN')}`, 475, rowY + 10, { width: 65, align: 'right' });

      // ----------------- TOTALS SECTION -----------------
      const totalY = rowY + 60;
      
      doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold');
      doc.text('Subtotal:', 350, totalY, { align: 'right' });
      doc.text(`GST (${invoice.gstPercent || 18}%):`, 350, totalY + 15, { align: 'right' });
      doc.fontSize(10).text('Total Amount Payable:', 320, totalY + 30, { align: 'right' });

      doc.font('Helvetica');
      doc.text(`INR ${(invoice.subtotal || 0).toLocaleString('en-IN')}`, 450, totalY, { align: 'right', width: 90 });
      doc.text(`INR ${(invoice.gstAmount || 0).toLocaleString('en-IN')}`, 450, totalY + 15, { align: 'right', width: 90 });
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor)
         .text(`INR ${(invoice.totalAmount || 0).toLocaleString('en-IN')}`, 450, totalY + 30, { align: 'right', width: 90 });

      // ----------------- PAYMENT INFORMATION SECTION -----------------
      const payInfoY = totalY + 70;
      doc.strokeColor(borderLineColor).lineWidth(1).moveTo(50, payInfoY).lineTo(545, payInfoY).stroke();

      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('PAYMENT DETAILS:', 50, payInfoY + 12);
      
      doc.fillColor('#475569').fontSize(9).font('Helvetica');
      doc.text(`Payment Status:`, 50, payInfoY + 28);
      doc.text(`Payment Date:`, 50, payInfoY + 40);
      doc.text(`Transaction ID:`, 50, payInfoY + 52);
      doc.text(`Payment Method:`, 50, payInfoY + 64);

      doc.fillColor('#000000').font('Helvetica-Bold');
      const paymentStatusStr = (invoice.paymentStatus || 'unpaid').toUpperCase();
      doc.fillColor(paymentStatusStr === 'PAID' ? '#16A34A' : '#DC2626')
         .text(paymentStatusStr, 150, payInfoY + 28);
      
      doc.fillColor('#000000').font('Helvetica');
      doc.text(invoice.paymentDate ? new Date(invoice.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A', 150, payInfoY + 40);
      doc.text(invoice.transactionId || 'N/A', 150, payInfoY + 52);
      doc.text(invoice.paymentMethod || 'N/A', 150, payInfoY + 64);

      // Footer notice
      doc.strokeColor(borderLineColor).lineWidth(1).moveTo(50, payInfoY + 95).lineTo(545, payInfoY + 95).stroke();
      doc.fillColor('#94A3B8').fontSize(9).font('Helvetica-Oblique').text('Thank you for partnering with WBI! This is a system-generated tax invoice and requires no physical signature.', 50, payInfoY + 110, { align: 'center', width: 495 });

      // End PDF Document
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate invoice PDF and upload directly to Cloudinary folder 'appzeto/invoices'
 */
const generateAndUploadInvoicePdf = async (invoice) => {
  try {
    console.log(`[Invoice PDF Generator] Generating PDF for invoice ${invoice.invoiceNumber}...`);
    const pdfBuffer = await generateInvoicePdfBuffer(invoice);
    
    console.log(`[Invoice PDF Generator] Uploading PDF buffer to Cloudinary...`);
    const uploadResult = await uploadToCloudinary(
      pdfBuffer, 
      'appzeto/invoices', // folder name
      'raw' // Raw format upload for PDF files
    );
    
    console.log(`[Invoice PDF Generator] PDF successfully uploaded: ${uploadResult.secure_url}`);
    return uploadResult.secure_url;
  } catch (error) {
    console.error('[Invoice PDF Generator] Failed to generate/upload invoice PDF:', error);
    throw error;
  }
};

module.exports = {
  generateInvoicePdfBuffer,
  generateAndUploadInvoicePdf
};
