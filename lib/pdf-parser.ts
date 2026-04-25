/**
 * pdf-parser.ts — Browser-Compatible Universal Payroll PDF Parser
 * 
 * Complete port of the Node.js PDF parser to run in the browser.
 * Uses pdfjs-dist for PDF text extraction.
 * 
 * Pipeline:
 *   PDF Upload → Text Extraction → Type Detection → Header Mapping
 *   → Row Segmentation → Dynamic Column Assignment → Normalization
 *   → Merge by HRPN → Validation → Structured Payroll Data
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for browser
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

// ============================================================
// TYPES
// ============================================================

export interface TextItem {
    x: number;
    text: string;
    width: number;
}

export interface TextLine {
    y: number;
    items: TextItem[];
    text: string;
}

export interface PageData {
    pageNum: number;
    lines: TextLine[];
}

export interface ExtractedText {
    pages: PageData[];
    rawText: string;
    fullLines: string[];
}

export interface PdfMeta {
    type: 'earning' | 'deduction';
    month: string | null;
    billNo: string | null;
    office: string | null;
}

export interface EmployeeBlock {
    srNo: number;
    hrpn: string;
    rawLines: TextLine[];
    dataLine: TextLine;
    page: number;
}

export interface ParsedEmployee {
    srNo: number;
    hrpn: string;
    name: string;
    designation: string;
    values: Array<{ value: number, x: number }>;
}

export interface NormalizedHeader {
    raw: string;
    canonical: string;
    category: string;
    x: number;
}

export interface SinglePdfResult {
    type: 'earning' | 'deduction';
    meta: PdfMeta;
    records: Array<{
        hrpn: string;
        name: string;
        designation: string;
        fields: Record<string, number>;
        rawValues: Array<{ value: number, x: number }>;
    }>;
    totalRow: { rawText: string; page: number; values: number[] } | null;
    headers: Array<{ label: string, x: number }>;
    normalizedHeaders: NormalizedHeader[];
}

export interface PayrollRecord {
    hrpn: string;
    name: string;
    designation: string;
    earning: Record<string, number>;
    deduction: Record<string, number>;
    gross: number;
    totalDed: number;
    netPay: number;
}

export interface ValidationResult {
    isValid: boolean;
    totalRecords: number;
    validRecords: number;
    errors: string[];
    warnings: string[];
    summary: {
        totalEmployees: number;
        totalGross: number;
        totalDeductions: number;
        totalNetPay: number;
        earningFieldsFound: string[];
        deductionFieldsFound: string[];
    };
}

export interface ProcessPayrollResult {
    payroll: PayrollRecord[];
    validation: ValidationResult;
    metadata: {
        processedAt: string;
        month: string | null;
        billNo: string | null;
        office: string | null;
        files: Array<{
            file: string;
            type: string;
            month: string | null;
            billNo: string | null;
            recordCount: number;
        }>;
        totalEmployees: number;
    };
}

// For progress reporting
export type ProgressCallback = (step: string, detail: string) => void;

// ============================================================
// MODULE 1: EXTRACT TEXT
// ============================================================

async function extractText(fileBuffer: ArrayBuffer): Promise<ExtractedText> {
    const data = new Uint8Array(fileBuffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages: PageData[] = [];
    const allLines: string[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const textContent = await page.getTextContent();

        const lineMap: Record<number, TextItem[]> = {};
        for (const item of textContent.items) {
            if (!('str' in item)) continue;
            const str = (item as any).str;
            if (str.trim() === '') continue;

            const y = Math.round((item as any).transform[5]);
            const x = Math.round((item as any).transform[4]);
            const width = (item as any).width || 0;

            if (!lineMap[y]) lineMap[y] = [];
            lineMap[y].push({ x, text: str.trim(), width });
        }

        const sortedYs = Object.keys(lineMap).map(Number).sort((a, b) => b - a);
        const lines: TextLine[] = [];

        for (const y of sortedYs) {
            const items = lineMap[y].sort((a, b) => a.x - b.x);
            const text = items.map(i => i.text).join(' ');
            lines.push({ y, items, text });
            allLines.push(text);
        }

        pages.push({ pageNum: p, lines });
    }

    return {
        pages,
        rawText: allLines.join('\n'),
        fullLines: allLines
    };
}

// ============================================================
// MODULE 2: DETECT TYPE
// ============================================================

function detectType(rawText: string): PdfMeta {
    const text = rawText.toLowerCase();

    let type: 'earning' | 'deduction';
    if (text.includes('earning side')) {
        type = 'earning';
    } else if (text.includes('deduction side')) {
        type = 'deduction';
    } else {
        throw new Error('Cannot detect PDF type: neither "Earning Side" nor "Deduction Side" found.');
    }

    let month: string | null = null;
    const monthMatch = rawText.match(/Month\s+of\s*:\s*([A-Za-z]+-\d{4})/i);
    if (monthMatch) month = monthMatch[1];

    let billNo: string | null = null;
    const billMatch = rawText.match(/Bill\s+No\.\s*:\s*(\S+)/i);
    if (billMatch) billNo = billMatch[1];

    let office: string | null = null;
    const officeMatch = rawText.match(/Name\s+of\s+Office\s*:\s*(.+?)(?:\s*Bill\s+No|$)/i);
    if (officeMatch) office = officeMatch[1].trim();

    return { type, month, billNo, office };
}

// ============================================================
// MODULE 3: PARSE HEADERS
// ============================================================

function findItemByText(items: Array<{ x: number; text: string; y?: number; width?: number }>, pattern: RegExp) {
    for (const item of items) {
        if (pattern.test(item.text)) return item;
    }
    return null;
}

function findByKeyword(items: Array<{ x: number; text: string }>, primaryPattern: RegExp, codePattern?: RegExp) {
    const item = findItemByText(items, primaryPattern);
    if (item) return { found: true, x: item.x };

    if (codePattern) {
        const codeItem = findItemByText(items, codePattern);
        if (codeItem) return { found: true, x: codeItem.x };
    }

    return { found: false, x: 0 };
}

function isNamePrefix(text: string) {
    return /^(Mr\.|Mrs\.|Miss\.|Ms\.|Dr\.|Shri\.|Smt\.)/i.test(text);
}

function getEarningDetectors() {
    return [
        { label: 'Basic Pay', detect: (items: any[], text: string) => findByKeyword(items, /Basic/i) },
        { label: 'DA (0103)', detect: (items: any[], text: string) => findByKeyword(items, /DA/i, /0103/) },
        { label: 'HRA (0110)', detect: (items: any[], text: string) => findByKeyword(items, /HRA/i, /0110/) },
        { label: 'CLA (0111)', detect: (items: any[], text: string) => findByKeyword(items, /CLA/i, /0111/) },
        { label: 'Med Allow', detect: (items: any[], text: string) => findByKeyword(items, /Med/i, /0107/) },
        { label: 'Trans Allow', detect: (items: any[], text: string) => findByKeyword(items, /Trans/i, /0113/) },
        {
            label: 'Special Additional Pay',
            detect: (items: any[], text: string) => {
                const special = findItemByText(items, /^Special$/i);
                const additional = findItemByText(items, /^Additional$/i);
                if (special && additional) return { found: true, x: Math.min(special.x, additional.x) };
                return findByKeyword(items, /Special/i);
            }
        },
        {
            label: 'Non Private Practice Allow',
            detect: (items: any[], text: string) => {
                const nonPrivate = findItemByText(items, /^Non\s*Private$/i);
                const practice = findItemByText(items, /Practice/i);
                if (nonPrivate || practice) {
                    const x = nonPrivate ? nonPrivate.x : (practice ? practice.x : 9999);
                    return { found: true, x };
                }
                if (/Non\s*Private/i.test(text) || /Practice\s*Allow/i.test(text) || /\(0128\)/i.test(text)) {
                    const item = findItemByText(items, /0128/);
                    return { found: true, x: item ? item.x : 500 };
                }
                return { found: false, x: 0 };
            }
        },
        { label: 'Washing Allow', detect: (items: any[], text: string) => findByKeyword(items, /Washing/i, /0132/) },
        { label: 'Nursing Allow', detect: (items: any[], text: string) => findByKeyword(items, /Nursing/i, /0129/) },
        { label: 'Uniform Allow', detect: (items: any[], text: string) => findByKeyword(items, /Uniform/i, /0131/) },
        { label: 'Book Allow', detect: (items: any[], text: string) => findByKeyword(items, /Book/i, /0104/) },
        { label: 'ESIS Allow', detect: (items: any[], text: string) => findByKeyword(items, /ESIS/i, /0127/) },
        {
            label: 'Recovery of Pay',
            detect: (items: any[], text: string) => {
                const recovery = findItemByText(items, /^Recovery$/i);
                if (recovery) return { found: true, x: recovery.x };
                return findByKeyword(items, /Recovery/i);
            }
        },
        { label: 'Gross Amt', detect: (items: any[], text: string) => findByKeyword(items, /Gross/i) }
    ];
}

function getDeductionDetectors() {
    return [
        { label: 'Income Tax', detect: (items: any[], text: string) => findByKeyword(items, /Income/i, /9510/) },
        { label: 'Prof Tax', detect: (items: any[], text: string) => findByKeyword(items, /Prof/i, /9570/) },
        { label: 'R&B', detect: (items: any[], text: string) => findByKeyword(items, /R&B/i, /9550/) },
        { label: 'GPF Reg Class 4', detect: (items: any[], text: string) => findByKeyword(items, /Class/i, /9531/) },
        {
            label: 'GPF Reg',
            detect: (items: any[], text: string) => {
                if (/GPF\s*Reg/i.test(text) || /9670/.test(text)) {
                    // Search for 9670 code explicitly first
                    const code = findItemByText(items, /9670/);
                    if (code) return { found: true, x: code.x };

                    // Find pure GPF block, ignoring Class 4 hits
                    for (const item of items) {
                        if (/GPF/i.test(item.text) && !/Class/i.test(item.text) && !/9531/.test(item.text)) {
                            return { found: true, x: item.x };
                        }
                    }
                }
                return { found: false, x: 0 };
            }
        },
        { label: 'NPS Reg', detect: (items: any[], text: string) => findByKeyword(items, /NPS/i, /9534/) },
        {
            label: 'Govt Fund',
            detect: (items: any[], text: string) => {
                if (/Govt\s*Fund/i.test(text) || /9581/.test(text)) {
                    const item = findItemByText(items, /Fund/i);
                    if (item) return { found: true, x: item.x };
                    const code = findItemByText(items, /9581/);
                    if (code) return { found: true, x: code.x };
                }
                return { found: false, x: 0 };
            }
        },
        {
            label: 'Govt Saving',
            detect: (items: any[], text: string) => {
                if (/Govt\s*Saving/i.test(text) || /9582/.test(text)) {
                    const item = findItemByText(items, /Saving/i);
                    if (item) return { found: true, x: item.x };
                    const code = findItemByText(items, /9582/);
                    if (code) return { found: true, x: code.x };
                }
                return { found: false, x: 0 };
            }
        },
        { label: 'Total Ded', detect: (items: any[], text: string) => findByKeyword(items, /Total\s*Ded/i) },
        { label: 'Net Pay', detect: (items: any[], text: string) => findByKeyword(items, /Net\s*Pay/i) }
    ];
}

function parseHeadersSmart(pageLines: TextLine[], pdfType: string) {
    const headerItems: Array<{ x: number; text: string; y: number; width: number }> = [];
    let inHeaderZone = false;

    for (const line of pageLines) {
        const text = line.text;

        if (/phone|mobile/i.test(text)) {
            inHeaderZone = true;
            continue;
        }

        if (inHeaderZone) {
            if (/^\d+\s+\d{8}/.test(text) || isNamePrefix(text.trim())) break;
            for (const item of line.items) {
                headerItems.push({ x: item.x, text: item.text, y: line.y, width: item.width || 0 });
            }
        }
    }

    if (headerItems.length === 0) {
        return { headers: [] as Array<{ label: string, x: number }>, isValid: false, rawHeaderText: '' };
    }

    const rawHeaderText = headerItems.map(i => i.text).join(' ');
    const detectors = pdfType === 'earning' ? getEarningDetectors() : getDeductionDetectors();
    const foundHeaders: Array<{ label: string; x: number }> = [];

    for (const detector of detectors) {
        const result = detector.detect(headerItems, rawHeaderText);
        if (result.found) {
            foundHeaders.push({ label: detector.label, x: result.x });
        }
    }

    foundHeaders.sort((a, b) => a.x - b.x);

    return {
        headers: foundHeaders, // Now returns Array<{label: string, x: number}>
        isValid: foundHeaders.length > 0,
        rawHeaderText
    };
}

// ============================================================
// MODULE 4: SEGMENT ROWS
// ============================================================

function isNamePrefixLine(text: string): boolean {
    return /^(Mr\.|Mrs\.|Miss\.|Ms\.|Dr\.|Shri\.|Smt\.)/i.test(text.trim());
}

function isSkipLine(text: string): boolean {
    if (!text || text.trim() === '') return true;
    if (/karmyogi|gujarat\.gov/i.test(text)) return true;
    if (/^total\b/i.test(text)) return true;
    if (/hereby certify|rupees\s*(\(|:)|superintendent|cardex\s*no|date\s*:/i.test(text)) return true;
    if (/PAYBILL|INNER SHEET|D\.D\.O|Name\s+of\s+(Office|D\.D\.O|Ministry)|Phone\s*no|Taluka|E-Mail|Address|Department|Major\s+Head|TAN\s+No|Bill\s+No|Cardex\s+No/i.test(text)) return true;
    if (/^ESIS\s+General\s+Hospital/i.test(text)) return true;
    return false;
}

function extractNumbers(text: string): number[] {
    const matches = text.match(/-?\d+\.?\d*/g) || [];
    return matches.map(Number);
}

function segmentRows(pages: PageData[]) {
    const employees: EmployeeBlock[] = [];
    let totalRow: { rawText: string; page: number; values: number[] } | null = null;

    for (const page of pages) {
        const { lines } = page;
        const dataLineIndices: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            const text = lines[i].text;
            if (/^\d+\s+\d{8}\s/.test(text)) {
                dataLineIndices.push(i);
            }
            if (/^total\b/i.test(text.trim())) {
                totalRow = {
                    rawText: text,
                    page: page.pageNum,
                    values: extractNumbers(text)
                };
            }
        }

        if (dataLineIndices.length === 0) continue;

        let headerEndIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            const text = lines[i].text.trim();
            if (isNamePrefixLine(text) || /^\d+\s+\d{8}\s/.test(lines[i].text)) {
                headerEndIdx = i;
                break;
            }
        }

        for (let d = 0; d < dataLineIndices.length; d++) {
            const dataIdx = dataLineIndices[d];
            const dataLine = lines[dataIdx];
            const blockLines: TextLine[] = [];

            let regionStart: number;
            if (d === 0) {
                regionStart = headerEndIdx;
            } else {
                regionStart = dataLineIndices[d - 1] + 1;
            }

            let thisEmployeeStart = dataIdx;
            for (let i = regionStart; i < dataIdx; i++) {
                const lineText = lines[i].text.trim();
                if (isSkipLine(lineText)) continue;

                if (isNamePrefixLine(lineText)) {
                    thisEmployeeStart = i;
                    break;
                }

                if (d === 0) {
                    thisEmployeeStart = i;
                    break;
                }
            }

            for (let i = thisEmployeeStart; i < dataIdx; i++) {
                const lineText = lines[i].text.trim();
                if (isSkipLine(lineText)) continue;
                blockLines.push(lines[i]);
            }

            blockLines.push(dataLine);

            let nextBoundary: number;
            if (d < dataLineIndices.length - 1) {
                nextBoundary = dataLineIndices[d + 1];
            } else {
                nextBoundary = lines.length;
            }

            for (let i = dataIdx + 1; i < nextBoundary; i++) {
                const lineText = lines[i].text.trim();
                if (/^total\b/i.test(lineText)) break;
                if (isSkipLine(lineText)) continue;
                if (isNamePrefixLine(lineText)) break;
                blockLines.push(lines[i]);
            }

            const dataMatch = dataLine.text.match(/^(\d+)\s+(\d{8})\s/);
            if (!dataMatch) continue;

            employees.push({
                srNo: parseInt(dataMatch[1]),
                hrpn: dataMatch[2],
                rawLines: blockLines,
                dataLine: dataLine,
                page: page.pageNum
            });
        }
    }

    return { employees, totalRow };
}

// ============================================================
// MODULE 5: PARSE EMPLOYEE BLOCK
// ============================================================

const DESIGNATIONS = [
    'Specialist',
    'Insurance Medical Officer',
    'Administrative Officer',
    'Junior Clerk',
    'Senior Clerk',
    'Junior Pharmacist',
    'Senior Pharmacist',
    'Matron',
    'Laboratory Technician',
    'Physiotherapist',
    'Head Nurse',
    'Staff Nurse',
    'Superintendent',
    'Peon',
    'Sweeper',
    'Watchman',
    'Driver',
    'Class-IV',
    'Class-III'
];

function isDesignation(text: string): boolean {
    const norm = text.trim();
    return DESIGNATIONS.some(d => norm.toLowerCase() === d.toLowerCase());
}

function isPayScale(text: string): boolean {
    const t = text.trim();
    return /^(PB-\d|pb-\d|\d{4,5}\)\/|\d{4,5}-\d|37400-|20200\)|34800\)|39100\)|67000|4440-)/i.test(t);
}

function removePayScaleFromLine(text: string): string {
    return text
        .replace(/\s*PB-\d\s*\([^)]*-?$/gi, '')
        .replace(/\s*PB-\d\s*\([^)]*\)\/\d+/gi, '')
        .replace(/\s*\d{4,5}\)\/\d+/g, '')
        .replace(/\s*\d{5}-\d{5}\/\d+/g, '')
        .replace(/\s*\d{4}-\d{4}\/\d{4}/g, '')
        .replace(/\s*\d{4}\/\d{4}/g, '')
        .replace(/\s*4440-\s*/g, '')
        .trim();
}

function isPartOfDesignation(tokens: string[], i: number): boolean {
    if (i > 0 && tokens[i - 1].toLowerCase() === 'class') return true;
    return false;
}

function findDesignation(text: string): { designation: string; namePart: string; afterDesig: string } | null {
    const sorted = [...DESIGNATIONS].sort((a, b) => b.length - a.length);
    for (const desig of sorted) {
        const idx = text.toLowerCase().indexOf(desig.toLowerCase());
        if (idx >= 0) {
            return {
                designation: text.substring(idx, idx + desig.length),
                namePart: text.substring(0, idx),
                afterDesig: text.substring(idx + desig.length)
            };
        }
    }
    return null;
}

function parseEmployeeBlock(block: EmployeeBlock, pdfType: string): ParsedEmployee {
    const { srNo, hrpn, rawLines, dataLine } = block;

    if (hrpn === '20032953') {
        const fs = typeof window === 'undefined' ? require('fs') : null;
        let out = `\n\n[DEBUG HRPN: 20032953, Type: ${pdfType}]\n`;
        out += `DataLine: "${dataLine.text}"\n`;
        out += "RawLines:\n";
        rawLines.forEach((rl, i) => out += `  ${i}: "${rl.text}" (Y=${rl.y})\n`);
        if (fs) fs.appendFileSync('debug_hrpn.txt', out);
    }

    const namesBefore: string[] = [];
    const namesAfter: string[] = [];
    let designation = '';
    let foundDataLine = false;
    let extraNumericValues: number[] = [];

    for (const line of rawLines) {
        if (line === dataLine) {
            foundDataLine = true;
            continue;
        }

        const text = line.text.trim();
        if (isPayScale(text)) continue;

        // Catch lines that are entirely numeric
        if (/^[-.\d\s]+$/.test(text) && /\d/.test(text)) {
            // we will handle this in item scanning later for precision
            continue;
        }

        const cleaned = removePayScaleFromLine(text);
        if (/^\(.*\)$/.test(cleaned)) {
            if (designation) designation += ' ' + cleaned;
            continue;
        }
        if (cleaned === '') continue;

        const desigInLine = findDesignation(cleaned);
        if (desigInLine) {
            if (!designation) designation = desigInLine.designation;
            const nameBit = desigInLine.namePart.trim();
            if (nameBit) {
                if (!foundDataLine) namesBefore.push(nameBit);
                else namesAfter.push(nameBit);
            }
            continue;
        }

        if (isDesignation(cleaned)) {
            if (!designation) designation = cleaned;
            continue;
        }

        if (!foundDataLine) {
            namesBefore.push(cleaned);
        } else {
            namesAfter.push(cleaned);
        }
    }

    const dataText = dataLine.text;
    const afterHrpn = dataText.replace(/^\d+\s+\d{8}\s+/, '');
    const tokens = afterHrpn.split(/\s+/);

    let textTokens: string[] = [];
    let numericStartIdx = -1;

    if (pdfType === 'earning') {
        for (let i = 0; i < tokens.length; i++) {
            if ((tokens[i] === 'No' || tokens[i] === 'Yes') &&
                i + 1 < tokens.length && /^[A-Z]$/.test(tokens[i + 1])) {
                textTokens = tokens.slice(0, i);
                numericStartIdx = i + 2;
                break;
            }
        }
    }

    if (numericStartIdx === -1) {
        for (let i = 0; i < tokens.length; i++) {
            if (/^-?\d+\.?\d*$/.test(tokens[i]) && !isPartOfDesignation(tokens, i)) {
                textTokens = tokens.slice(0, i);
                numericStartIdx = i;
                break;
            }
        }
    }

    const textStr = textTokens.join(' ');
    const desigMatch = findDesignation(textStr);

    let nameInDataLine = '';
    if (desigMatch) {
        if (!designation) designation = desigMatch.designation;
        nameInDataLine = desigMatch.namePart.trim();
    } else {
        nameInDataLine = textStr.trim();
    }

    const allNameParts: string[] = [];
    for (const n of namesBefore) if (n) allNameParts.push(n);
    if (nameInDataLine) allNameParts.push(nameInDataLine);
    for (const n of namesAfter) if (n) allNameParts.push(n);

    let fullName = allNameParts.join(' ').replace(/\s+/g, ' ').trim();
    fullName = removePayScaleFromLine(fullName).replace(/\s+/g, ' ').trim();

    // SMART NUMBER EXTRACTION via coordinates
    const extractedNumericItems: Array<{ value: number, x: number }> = [];

    for (const line of rawLines) {
        for (const item of line.items) {
            const text = item.text.trim();
            if (!text) continue;

            const splitTokens = text.split(/\s+/);
            let currentX = item.x;
            const estWidth = splitTokens.length > 0 ? (item.width || 0) / splitTokens.length : 0;

            for (const token of splitTokens) {
                const cleaned = token.replace(/,/g, '');
                if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
                    if (cleaned === hrpn || cleaned === String(srNo)) {
                        // Skip HRPN or SrNo
                    } else if (cleaned.length === 4 && /^20[12]\d$/.test(cleaned) && !cleaned.includes('.')) {
                        // Skip isolated years like 2024
                    } else if (cleaned.length === 10 && !cleaned.includes('.')) {
                        // Skip long 10-digit integers like phone numbers without decimals
                    } else {
                        extractedNumericItems.push({ value: parseFloat(cleaned), x: currentX });
                    }
                }
                currentX += estWidth;
            }
        }
    }

    return { srNo: Number(srNo), hrpn, name: fullName, designation: designation || '', values: extractedNumericItems };
}

// ============================================================
// MODULE 6: NORMALIZE FIELDS
// ============================================================

const HEADER_NORMALIZATION_MAP = [
    // EARNING
    { pattern: /basic\s*pay/i, canonical: 'basic', category: 'earning' },
    { pattern: /\bda\b/i, canonical: 'da', category: 'earning' },
    { pattern: /\bhra\b/i, canonical: 'hra', category: 'earning' },
    { pattern: /\bcla\b/i, canonical: 'cla', category: 'earning' },
    { pattern: /med\s*allow/i, canonical: 'medAllow', category: 'earning' },
    { pattern: /trans\s*allow/i, canonical: 'transAllow', category: 'earning' },
    { pattern: /special\s*additional\s*pay/i, canonical: 'specialPay', category: 'earning' },
    { pattern: /non\s*private\s*practice\s*allow/i, canonical: 'nppAllow', category: 'earning' },
    { pattern: /washing\s*allow/i, canonical: 'washingAllow', category: 'earning' },
    { pattern: /nursing\s*allow/i, canonical: 'nursingAllow', category: 'earning' },
    { pattern: /uniform\s*allow/i, canonical: 'uniformAllow', category: 'earning' },
    { pattern: /book\s*allow/i, canonical: 'bookAllow', category: 'earning' },
    { pattern: /esis\s*allow/i, canonical: 'esisAllow', category: 'earning' },
    { pattern: /recovery\s*of\s*pay/i, canonical: 'recoveryOfPay', category: 'earning' },
    { pattern: /gross\s*amt/i, canonical: 'gross', category: 'earning' },
    { pattern: /\bslo\b/i, canonical: 'slo', category: 'earning' },
    // DEDUCTION
    { pattern: /income\s*tax/i, canonical: 'incomeTax', category: 'deduction' },
    { pattern: /prof\s*tax/i, canonical: 'profTax', category: 'deduction' },
    { pattern: /r\s*&\s*b/i, canonical: 'rnb', category: 'deduction' },
    { pattern: /gpf\s*reg\s*class\s*4/i, canonical: 'gpfClass4', category: 'deduction' },
    { pattern: /gpf\s*reg\b/i, canonical: 'gpfReg', category: 'deduction' },
    { pattern: /nps\s*reg/i, canonical: 'npsReg', category: 'deduction' },
    { pattern: /govt?\s*fund/i, canonical: 'govtFund', category: 'deduction' },
    { pattern: /govt?\s*saving/i, canonical: 'govtSaving', category: 'deduction' },
    { pattern: /total\s*ded/i, canonical: 'totalDed', category: 'deduction' },
    { pattern: /net\s*pay/i, canonical: 'netPay', category: 'deduction' }
];

function normalizeHeader(rawHeader: string): { canonical: string; category: string } {
    for (const mapping of HEADER_NORMALIZATION_MAP) {
        if (mapping.pattern.test(rawHeader)) {
            return { canonical: mapping.canonical, category: mapping.category };
        }
    }
    const fallback = rawHeader
        .replace(/\([^)]*\)/g, '')
        .trim()
        .split(/\s+/)
        .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
    return { canonical: fallback || 'unknown', category: 'unknown' };
}

function normalizeFields(headers: Array<{ canonical: string, x: number }>, values: Array<{ value: number, x: number }>): Record<string, number> {
    const record: Record<string, number> = {};

    // Sort values strictly by X to ensure we can map closest reliably
    const sortedValues = [...values].sort((a, b) => a.x - b.x);

    for (const header of headers) {
        let bestMatchIdx = -1;
        let minDiff = 10000;

        for (let i = 0; i < sortedValues.length; i++) {
            const val = sortedValues[i];
            const diff = Math.abs(header.x - val.x);
            // If the value is reasonably close to the header column (e.g. within 150 units)
            // or if it's the absolute closest, we might match it. 
            // In a table, usually the absolute closest match is correct.
            if (diff < minDiff && diff < 150) {
                minDiff = diff;
                bestMatchIdx = i;
            }
        }

        if (bestMatchIdx !== -1) {
            record[header.canonical] = sortedValues[bestMatchIdx].value;
            // Remove it so it doesn't get assigned to another column
            sortedValues.splice(bestMatchIdx, 1);
        } else {
            record[header.canonical] = 0;
        }
    }

    return record;
}

// ============================================================
// MODULE 7: MERGE PAYROLL
// ============================================================

function mergePayroll(earningRecords: any[], deductionRecords: any[]): PayrollRecord[] {
    const payrollMap = new Map<string, PayrollRecord>();

    for (const rec of earningRecords) {
        if (!payrollMap.has(rec.hrpn)) {
            payrollMap.set(rec.hrpn, {
                hrpn: rec.hrpn, name: rec.name, designation: rec.designation,
                earning: {}, deduction: {}, gross: 0, totalDed: 0, netPay: 0
            });
        }
        const entry = payrollMap.get(rec.hrpn)!;
        if (rec.name.length > entry.name.length) entry.name = rec.name;
        if (rec.designation && (!entry.designation || rec.designation.length > entry.designation.length)) {
            entry.designation = rec.designation;
        }
        entry.earning = { ...entry.earning, ...rec.fields };
        if (rec.fields.gross) entry.gross = rec.fields.gross;
    }

    for (const rec of deductionRecords) {
        if (!payrollMap.has(rec.hrpn)) {
            payrollMap.set(rec.hrpn, {
                hrpn: rec.hrpn, name: rec.name, designation: rec.designation,
                earning: {}, deduction: {}, gross: 0, totalDed: 0, netPay: 0
            });
        }
        const entry = payrollMap.get(rec.hrpn)!;
        if (rec.name.length > entry.name.length) entry.name = rec.name;
        if (rec.designation && (!entry.designation || rec.designation.length > entry.designation.length)) {
            entry.designation = rec.designation;
        }
        const deductionFields = { ...rec.fields };
        if (deductionFields.totalDed !== undefined) {
            entry.totalDed = deductionFields.totalDed;
            delete deductionFields.totalDed;
        }
        if (deductionFields.netPay !== undefined) {
            entry.netPay = deductionFields.netPay;
            delete deductionFields.netPay;
        }
        entry.deduction = { ...entry.deduction, ...deductionFields };
    }

    const results = Array.from(payrollMap.values());
    results.sort((a, b) => a.hrpn.localeCompare(b.hrpn));
    return results;
}

function combineRecordSets(recordSets: any[][]): any[] {
    const combined: any[] = [];
    const seen = new Set<string>();

    for (const records of recordSets) {
        for (const rec of records) {
            if (seen.has(rec.hrpn)) {
                const existing = combined.find(r => r.hrpn === rec.hrpn);
                if (existing) {
                    existing.fields = { ...existing.fields, ...rec.fields };
                    if (rec.name.length > existing.name.length) existing.name = rec.name;
                }
            } else {
                seen.add(rec.hrpn);
                combined.push({ ...rec });
            }
        }
    }

    return combined;
}

// ============================================================
// MODULE 8: VALIDATE RESULTS
// ============================================================

function validateRecord(record: PayrollRecord) {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (record.gross > 0 && Object.keys(record.earning).length > 0) {
        const earningSum = Object.entries(record.earning)
            .filter(([key]) => key !== 'gross' && key !== 'slo')
            .reduce((sum, [, val]) => sum + (val || 0), 0);
        const grossDiff = Math.abs(earningSum - record.gross);
        if (grossDiff > 1) {
            warnings.push(`HRPN ${record.hrpn}: Earning sum (${earningSum.toFixed(2)}) ≠ Gross (${record.gross.toFixed(2)})`);
        }
    }

    if (record.gross > 0 && record.totalDed > 0 && record.netPay > 0) {
        const computedNet = record.gross - record.totalDed;
        const netDiff = Math.abs(computedNet - record.netPay);
        if (netDiff > 1) {
            errors.push(`HRPN ${record.hrpn}: Gross-Ded=${computedNet} ≠ NetPay=${record.netPay}`);
        }
    }

    if (!record.hrpn || !/^\d{8}$/.test(record.hrpn)) {
        errors.push(`Invalid HRPN: "${record.hrpn}"`);
    }

    return { isValid: errors.length === 0, errors, warnings };
}

function validateResults(records: PayrollRecord[], earningTotalRow: any = null, deductionTotalRow: any = null): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let validCount = 0;

    for (const record of records) {
        const result = validateRecord(record);
        if (result.isValid) validCount++;
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
    }

    const earningFieldsFound = new Set<string>();
    const deductionFieldsFound = new Set<string>();

    for (const rec of records) {
        Object.keys(rec.earning || {}).forEach(k => earningFieldsFound.add(k));
        Object.keys(rec.deduction || {}).forEach(k => deductionFieldsFound.add(k));
    }

    return {
        isValid: allErrors.length === 0,
        totalRecords: records.length,
        validRecords: validCount,
        errors: allErrors,
        warnings: allWarnings,
        summary: {
            totalEmployees: records.length,
            totalGross: records.reduce((s, r) => s + (r.gross || 0), 0),
            totalDeductions: records.reduce((s, r) => s + (r.totalDed || 0), 0),
            totalNetPay: records.reduce((s, r) => s + (r.netPay || 0), 0),
            earningFieldsFound: [...earningFieldsFound],
            deductionFieldsFound: [...deductionFieldsFound]
        }
    };
}

// ============================================================
// MAIN: parseSinglePDF + processPayroll
// ============================================================

async function parseSinglePDF(fileName: string, fileBuffer: ArrayBuffer, onProgress?: ProgressCallback): Promise<SinglePdfResult> {
    onProgress?.('Extracting', `Reading text from ${fileName}...`);
    const extracted = await extractText(fileBuffer);

    onProgress?.('Detecting', `Detecting PDF type for ${fileName}...`);
    const meta = detectType(extracted.rawText);

    onProgress?.('Headers', `Parsing headers (${meta.type}) from ${fileName}...`);
    const headerResult = parseHeadersSmart(extracted.pages[0].lines, meta.type);

    const normalizedHeaders: NormalizedHeader[] = headerResult.headers.map(h => ({
        raw: h.label,
        x: h.x,
        ...normalizeHeader(h.label)
    }));

    onProgress?.('Segmenting', `Segmenting employee rows from ${fileName}...`);
    const { employees, totalRow } = segmentRows(extracted.pages);

    onProgress?.('Parsing', `Parsing ${employees.length} employee blocks from ${fileName}...`);
    const records = [];

    for (const block of employees) {
        const parsed = parseEmployeeBlock(block, meta.type);
        const fields = normalizeFields(
            normalizedHeaders,
            parsed.values
        );
        records.push({
            hrpn: parsed.hrpn,
            name: parsed.name,
            designation: parsed.designation,
            fields,
            rawValues: parsed.values
        });
    }

    return {
        type: meta.type,
        meta,
        records,
        totalRow,
        headers: headerResult.headers,
        normalizedHeaders
    };
}

export async function processPayrollFromFiles(
    files: Array<{ name: string; buffer: ArrayBuffer }>,
    onProgress?: ProgressCallback
): Promise<ProcessPayrollResult> {
    const earningRecords: any[][] = [];
    const deductionRecords: any[][] = [];
    let earningTotalRow: any = null;
    let deductionTotalRow: any = null;
    const allMetadata: any[] = [];
    let month: string | null = null;
    let billNo: string | null = null;
    let office: string | null = null;

    for (const file of files) {
        try {
            onProgress?.('Processing', `Processing ${file.name}...`);
            const result = await parseSinglePDF(file.name, file.buffer, onProgress);

            if (!month && result.meta.month) month = result.meta.month;
            if (!billNo && result.meta.billNo) billNo = result.meta.billNo;
            if (!office && result.meta.office) office = result.meta.office;

            allMetadata.push({
                file: file.name,
                type: result.type,
                month: result.meta.month,
                billNo: result.meta.billNo,
                recordCount: result.records.length
            });

            if (result.type === 'earning') {
                earningRecords.push(result.records);
                if (result.totalRow) earningTotalRow = result.totalRow;
            } else {
                deductionRecords.push(result.records);
                if (result.totalRow) deductionTotalRow = result.totalRow;
            }
        } catch (err: any) {
            console.error(`Error parsing ${file.name}:`, err);
            onProgress?.('Error', `Failed to parse ${file.name}: ${err.message}`);
        }
    }

    onProgress?.('Merging', 'Merging records by HRPN...');

    const combinedEarnings = earningRecords.length > 0 ? combineRecordSets(earningRecords) : [];
    const combinedDeductions = deductionRecords.length > 0 ? combineRecordSets(deductionRecords) : [];

    const payroll = mergePayroll(combinedEarnings, combinedDeductions);

    onProgress?.('Validating', 'Cross-validating results...');
    const validation = validateResults(payroll, earningTotalRow, deductionTotalRow);

    onProgress?.('Complete', `Processed ${payroll.length} employees successfully!`);

    return {
        payroll,
        validation,
        metadata: {
            processedAt: new Date().toISOString(),
            month,
            billNo,
            office,
            files: allMetadata,
            totalEmployees: payroll.length
        }
    };
}

// ============================================================
// UTILITY: Convert payroll record to Supabase row format
// ============================================================

export function payrollToSupabaseRow(record: PayrollRecord, monthDate: string, monthYear: string, sourceFiles: string[], billNo?: string | null, office?: string | null) {
    return {
        hrpn: record.hrpn,
        name: record.name,
        designation: record.designation || null,
        month_year: monthYear,
        month_date: monthDate,

        // Earnings
        basic: record.earning.basic || 0,
        da: record.earning.da || 0,
        hra: record.earning.hra || 0,
        cla: record.earning.cla || 0,
        med_allow: record.earning.medAllow || 0,
        trans_allow: record.earning.transAllow || 0,
        book_allow: record.earning.bookAllow || 0,
        npp_allow: record.earning.nppAllow || record.earning.nppallow || 0,
        esis_allow: record.earning.esisAllow || 0,
        special_pay: record.earning.specialPay || 0,
        washing_allow: record.earning.washingAllow || 0,
        nursing_allow: record.earning.nursingAllow || 0,
        uniform_allow: record.earning.uniformAllow || 0,
        recovery_of_pay: record.earning.recoveryOfPay || 0,
        slo: record.earning.slo || 0,

        // Deductions
        income_tax: record.deduction.incomeTax || 0,
        prof_tax: record.deduction.profTax || 0,
        gpf_reg: record.deduction.gpfReg || 0,
        gpf_class4: record.deduction.gpfClass4 || 0,
        nps_reg: record.deduction.npsReg || 0,
        rnb: record.deduction.rnb || 0,
        govt_fund: record.deduction.govtFund || 0,
        govt_saving: record.deduction.govtSaving || 0,

        // Summary
        gross: record.gross || 0,
        total_ded: record.totalDed || 0,
        net_pay: record.netPay || 0,

        // Metadata
        source_files: sourceFiles,
        bill_no: billNo || null,
        office: office || null,
    };
}

/**
 * Convert "January-2026" to "2026-01-01" date format
 */
export function monthYearToDate(monthYear: string): string {
    const months: Record<string, string> = {
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12'
    };
    const parts = monthYear.split('-');
    if (parts.length === 2) {
        const monthNum = months[parts[0].toLowerCase()] || '01';
        return `${parts[1]}-${monthNum}-01`;
    }
    return monthYear;
}
