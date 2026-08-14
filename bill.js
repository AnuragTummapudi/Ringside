const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { v4: uuid } = require('uuid');

const MAX_TEXT = 20_000;

function parseMoney(value) {
  if (value == null) return null;
  const digits = String(value).replace(/[^\d.]/g, '');
  const number = Number(digits);
  return Number.isFinite(number) && number > 0 && number < 10_000_000 ? Math.round(number) : null;
}

function firstMatch(text, patterns, parser = (value) => value.trim()) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return parser(match[1]);
  }
  return null;
}

function extractTextFromFile(filePath, originalName = '') {
  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext === '.txt' || ext === '.md' || ext === '.json') {
    return fs.readFileSync(filePath, 'utf8').slice(0, MAX_TEXT);
  }

  if (ext === '.pdf') {
    try {
      return childProcess.execFileSync('pdftotext', ['-layout', filePath, '-'], {
        timeout: 8_000,
        encoding: 'utf8',
      }).slice(0, MAX_TEXT);
    } catch {
      return '';
    }
  }

  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    try {
      return childProcess.execFileSync('tesseract', [filePath, 'stdout', '--psm', '6'], {
        timeout: 12_000,
        encoding: 'utf8',
      }).slice(0, MAX_TEXT);
    } catch {
      return '';
    }
  }
  return '';
}

function extractBillData(text = '', filename = '') {
  const normalized = String(text).replace(/\r/g, '').replace(/[ \t]+/g, ' ').slice(0, MAX_TEXT);
  const provider = firstMatch(normalized, [
    /(?:provider|company|service provider)\s*[:\-]\s*([^\n,]+)/i,
    /(?:bill from|invoice from)\s+([^\n,]+)/i,
  ]);
  const planName = firstMatch(normalized, [/(?:plan|package)\s*[:\-]\s*([^\n,]+)/i]);
  const currentMonthlyPrice = firstMatch(normalized, [
    /(?:monthly|per month|amount due|total due|current bill)[^₹$\d]{0,20}[₹$]?\s*([\d,]+(?:\.\d+)?)/i,
    /₹\s*([\d,]+)\s*(?:\/\s*month|monthly)/i,
  ], parseMoney);
  const previousMonthlyPrice = firstMatch(normalized, [/(?:previous|last month|prior bill)[^₹$\d]{0,20}[₹$]?\s*([\d,]+)/i], parseMoney);
  const promotionalPrice = firstMatch(normalized, [/(?:promo(?:tional)?|offer price|discounted)[^₹$\d]{0,20}[₹$]?\s*([\d,]+)/i], parseMoney);
  const taxes = firstMatch(normalized, [/(?:tax|gst)[^₹$\d]{0,20}[₹$]?\s*([\d,]+)/i], parseMoney);
  const fees = firstMatch(normalized, [/(?:fee|surcharge)[^₹$\d]{0,20}[₹$]?\s*([\d,]+)/i], parseMoney);
  const speed = firstMatch(normalized, [/(?:speed|bandwidth)\s*[:\-]?\s*([^\n,]+)/i]);
  const billingPeriod = /annual|yearly|12\s*months?/i.test(normalized) ? 'annual' : 'monthly';
  const accountNumber = firstMatch(normalized, [/(?:account|customer)\s*(?:number|no\.?|id)\s*[:\-]?\s*([A-Z0-9\-]+)/i]);
  const invoiceNumber = firstMatch(normalized, [/(?:invoice|bill)\s*(?:number|no\.?|id)\s*[:\-]?\s*([A-Z0-9\-]+)/i]);
  const confidence = {
    provider: provider ? 0.9 : 0,
    planName: planName ? 0.75 : 0,
    currentMonthlyPrice: currentMonthlyPrice ? 0.86 : 0,
    speed: speed ? 0.7 : 0,
  };
  return {
    billId: uuid(),
    provider: provider || undefined,
    service: provider || undefined,
    planName: planName || undefined,
    currentMonthlyPrice: billingPeriod === 'annual' && currentMonthlyPrice ? Math.round(currentMonthlyPrice / 12) : currentMonthlyPrice || undefined,
    previousMonthlyPrice: previousMonthlyPrice || undefined,
    billingPeriod,
    taxes: taxes || undefined,
    fees: fees || undefined,
    promotionalPrice: promotionalPrice || undefined,
    speed: speed || undefined,
    accountNumber: accountNumber || undefined,
    invoiceNumber: invoiceNumber || undefined,
    extractedText: normalized || undefined,
    sourceFilename: filename || undefined,
    confidence,
    extractionStatus: normalized ? 'extracted' : 'needs_confirmation',
  };
}

function maskIdentifier(value) {
  if (!value) return undefined;
  const clean = String(value);
  return clean.length <= 4 ? '••••' : `••••••${clean.slice(-4)}`;
}

function sanitizeBillForClient(bill) {
  if (!bill) return null;
  return {
    ...bill,
    accountNumber: maskIdentifier(bill.accountNumber),
    invoiceNumber: maskIdentifier(bill.invoiceNumber),
    extractedText: undefined,
  };
}

module.exports = { MAX_TEXT, parseMoney, extractTextFromFile, extractBillData, maskIdentifier, sanitizeBillForClient };
