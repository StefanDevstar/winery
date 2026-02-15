import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import Papa from "papaparse";
import * as XLSX from "xlsx";

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Detect "6pk" or "12pk" inside the client description string
function detectPkFromDesc(desc) {
  const s = String(desc || "").toLowerCase();
  if (/\b6pk\b/.test(s)) return 6;
  if (/\b12pk\b/.test(s)) return 12;
  return null;
}

// Convert qty into 12pk units (6pk counts as half)
function to12pkUnits(qty, pk) {
  const n = Number(qty || 0);
  if (!Number.isFinite(n)) return 0;
  if (pk === 6) return n / 2;
  return n; // 12pk or unknown -> treat as-is
}

// Make a stable key like "JT 25 SAB NZ" by removing MAGNUM/C/S/6pk/12pk
function normalizeMagnumCsKey(desc) {
  return String(desc || "")
    .toUpperCase()
    .replace(/\bMAGNUM\b/g, "")
    .replace(/\bC\/S\b/g, "")
    .replace(/\b6PK\b/g, "")
    .replace(/\b12PK\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Pick a sensible qty field from a warehouse row
function getWarehouseQty(row) {
  // Priority: Available -> OnHand -> StockOnHand -> anything numeric-ish
  const candidates = [
    row?.Available,
    row?.OnHand,
    row?.StockOnHand,
    row?.["On Hand"],
    row?.Quantity,
    row?.Qty,
  ];

  for (const v of candidates) {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Summarize warehouse rows into a small table:
 * WineKey | cs_12pk | magnum_12pk
 *
 * Uses getWarehouseClientDescription(row) to find the descriptor string.
 * Uses 6pk/12pk inside descriptor to convert into 12pk units.
 */
export function summarizeWarehouseMagnumAndCS(warehouseRows, { debug = false } = {}) {
  const map = new Map();

  for (let i = 0; i < (warehouseRows || []).length; i++) {
    const row = warehouseRows[i];
    if (!row) continue;

    const desc = getWarehouseClientDescription(row) || "";
    if (!desc) continue;

    const u = desc.toUpperCase();
    const isMagnum = /\bMAGNUM\b/.test(u);
    const isCS = /\bC\/S\b/.test(u);

    // only care about these special packs
    if (!isMagnum && !isCS) continue;

    const qtyRaw = getWarehouseQty(row);
    const pk = detectPkFromDesc(desc);
    const qty12pk = to12pkUnits(qtyRaw, pk);

    const key = normalizeMagnumCsKey(desc) || u.trim();
    if (!map.has(key)) {
      map.set(key, { wine: key, cs_12pk: 0, magnum_12pk: 0 });
    }

    const agg = map.get(key);
    if (isCS) agg.cs_12pk += qty12pk;
    if (isMagnum) agg.magnum_12pk += qty12pk;

    if (debug && i < 25) {
      console.log("[WH MAGNUM/CS LINE]", {
        i,
        desc,
        key,
        isCS,
        isMagnum,
        qtyRaw,
        pk,
        qty12pk,
      });
    }
  }

  const out = Array.from(map.values())
    .map(r => ({
      ...r,
      cs_12pk: Math.round(r.cs_12pk * 100) / 100,
      magnum_12pk: Math.round(r.magnum_12pk * 100) / 100,
      total_12pk: Math.round((r.cs_12pk + r.magnum_12pk) * 100) / 100,
    }))
    .sort((a, b) => b.total_12pk - a.total_12pk);

  if (debug) {
    console.log("[WH MAGNUM/CS TABLE]");
    console.table(out);
  }

  return out;
}


const PK_RE = /\b(6|12)\s*(pk|pck)\b/i;

/**
 * Return the string that contains "... 6pk" or "... 12pk".
 * We DO NOT parse from other formats like "750ml/6p" etc.
 *
 * Priority:
 * 1) explicit client description fields (if your normalizer sets them)
 * 2) ProductName (because your keys include it and it often holds the "12pk" text)
 * 3) _originalData (because you store the raw row there)
 * 4) last-resort scan of _originalData string values for something containing 6pk/12pk
 */
export function getWarehouseClientDescription(row) {
  if (!row) return "";

  // 1) explicit fields (if present)
  const directCandidates = [
    row.clientDescription,
    row.ClientDescription,
    row["Client Description"],
    row["ClientDescription"],
  ];

  for (const v of directCandidates) {
    const s = (v ?? "").toString().trim();
    if (PK_RE.test(s)) return s;
  }

  // 2) Commonly, your parsed sheet stores that "JT 22 PIG US 12pk" in ProductName
  const productNameCandidates = [
    row.ProductName,
    row["ProductName"],
    row["Product Name"],
  ];

  for (const v of productNameCandidates) {
    const s = (v ?? "").toString().trim();
    if (PK_RE.test(s)) return s;
  }

  // 3) check _originalData in case the value wasn't lifted to top-level
  const od = row._originalData;
  if (od && typeof od === "object") {
    const odCandidates = [
      od.clientDescription,
      od.ClientDescription,
      od["Client Description"],
      od["ClientDescription"],
      od.ProductName,
      od["ProductName"],
      od["Product Name"],
    ];

    for (const v of odCandidates) {
      const s = (v ?? "").toString().trim();
      if (PK_RE.test(s)) return s;
    }

    // 4) last resort: find ANY string cell in original row that contains 6pk/12pk
    for (const [, v] of Object.entries(od)) {
      if (typeof v !== "string") continue;
      const s = v.trim();
      if (PK_RE.test(s)) return s;
    }
  }

  return "";
}

export function extractPackSizeFromClientDescription(clientDescRaw) {
  const s = (clientDescRaw || "").toString().trim().toLowerCase();
  const m = s.match(/\b(6|12)\s*(pk|pck)\b/);
  if (!m) return 12;
  return Number(m[1]) === 6 ? 6 : 12;
}

export function packMultiplierFromClientDescription(clientDescRaw) {
  return extractPackSizeFromClientDescription(clientDescRaw) === 6 ? 0.5 : 1;
}

export function getWarehouseAvailable12pk(row) {
  const availableRaw = Number(row?.Available ?? row?.available ?? 0) || 0;
  const clientDesc = getWarehouseClientDescription(row); // now should find "...12pk/6pk"
  const mult = packMultiplierFromClientDescription(clientDesc);
  return availableRaw * mult;
}



// ---------- Brand parsing (shared) ----------
export const BRAND_NAME_MAP = {
  JT: "Jules Taylor",
  TBH: "The Better Half",
  OTQ: "On the Quiet",
};

export function normalizeBrandToCode(text) {
  const s = String(text || "").toUpperCase();

  let best = { code: "", idx: -1 };
  const scan = (code, patterns) => {
    for (const p of patterns) {
      const idx = s.lastIndexOf(p);
      if (idx > best.idx) best = { code, idx };
    }
  };

  scan("JT", ["JULES TAYLOR", "JTW", "JT"]);
  scan("TBH", ["THE BETTER HALF", "BETTER HALF", "TBH", "BH"]);
  scan("OTQ", ["ON THE QUIET", "OTQ"]);

  return best.code;
}

export function getBrandCodeFromRow(r) {
  const direct =
    r.BrandCode ||
    r.Brand ||
    r["Brand"] ||
    "";

  let code = normalizeBrandToCode(direct);
  if (code) return code;

  const fallback =
    r["Wine Name"] ||
    r["Wines"] ||
    r["Product Description (SKU)"] ||
    r.Stock ||
    r.SKU ||
    r.Code ||
    r.ProductName ||
    r.Product ||
    r.Description ||
    r.AdditionalAttribute3 ||
    "";

  return normalizeBrandToCode(fallback);
}


// Simple, robust CSV parser returning array of objects.
// Handles quoted fields, commas inside quotes, and trims headers.
export function parseCSV(text, { delimiter = ',', skipEmptyLines = true } = {}) {
  if (!text) return [];

  // Normalize newlines
  const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Find header row (first non-empty)
  let headerRowIndex = rows.findIndex(r => r.trim() !== '');
  if (headerRowIndex === -1) return [];

  const headerLine = rows[headerRowIndex];

  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { // escaped quote
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result.map(s => s.trim());
  };

  const headers = parseLine(headerLine).map(h => h.replace(/^\uFEFF/, '').trim());

  const records = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const line = rows[i];
    if (skipEmptyLines && (!line || line.trim() === '')) continue;
    const values = parseLine(line);
    // If row has fewer values, fill with empty strings
    while (values.length < headers.length) values.push('');
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    records.push(obj);
  }

  return records;
}


export function parseCSVWithPapa(text) {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const YM_REGEX = /^(?:\d{2,4}-[A-Za-z]{3}|[A-Za-z]{3}-\d{2,4})$/i;

  const clean = (v) => String(v ?? '').replace(/^\uFEFF/, '').trim();
  const parseNumber = (v) => {
    if (v === undefined || v === null || v === '') return 0;
    const s = String(v).replace(/,/g, '').replace(/\(/g, '-').replace(/\)/g, '');
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };

  // Parse raw rows so we can find multiple header blocks
  const { data: rawRows } = Papa.parse(text, { header: false, skipEmptyLines: false });
  const totals = {};
  const IGNORE_ROW_NAMES = new Set(["Totals", "Total", "Grand Total", "Compared to Month PY"]);

  for (let i = 0; i < rawRows.length; i++) {
    const row = (rawRows[i] || []).map(clean);
    // find any YM headers in this row
    const headerCols = row.map((c, idx) => ({ c, idx })).filter(x => YM_REGEX.test(x.c));
    if (headerCols.length === 0) continue;

    // build column -> { year, month }
    const colMap = [];
    for (const h of headerCols) {
      const parts = h.c.split('-');
      let yy = parts[0], mm = parts[1];
      if (/^\d/.test(parts[0])) { // 22-Jan or 2022-Jan
        yy = parts[0]; mm = parts[1];
      } else { // Jan-22 or Jan-2022
        mm = parts[0]; yy = parts[1];
      }
      if (!yy || !mm) continue;
      let year = yy;
      if (year.length === 2) year = Number(year) >= 50 ? `19${year}` : `20${year}`;
      const m3 = (mm || '').slice(0, 3).toLowerCase();
      const month = MONTHS.find(M => M.toLowerCase() === m3);
      if (!month) continue;
      colMap.push({ idx: h.idx, year, month });
    }
    if (colMap.length === 0) continue;

    // read following rows until blank row or next header
    for (let r = i + 1; r < rawRows.length; r++) {
      const prow = (rawRows[r] || []).map(clean);
      const allEmpty = prow.every(c => c === '');
      if (allEmpty) break;
      // stop if this row looks like another header row
      if (prow.some(c => YM_REGEX.test(c))) break;

      // skip summary rows
      const firstCell = String(prow[0] ?? '').trim();
      if (IGNORE_ROW_NAMES.has(firstCell) || /^\s*Compared to/i.test(firstCell)) continue;

      for (const col of colMap) {
        const rawVal = prow[col.idx];
        const v = parseNumber(rawVal);
        if (!totals[col.year]) totals[col.year] = {};
        totals[col.year][col.month] = (totals[col.year][col.month] || 0) + v;
      }
    }
  }

  const sortedTotals = Object.fromEntries(
    Object.entries(totals).map(([year, monthsObj]) => {
      const sorted = Object.fromEntries(
        MONTHS.filter(m => monthsObj[m] !== undefined).map(m => [m, Number(monthsObj[m].toFixed(2))])
      );
      return [year, sorted];
    })
  );

  const totalsYYYYMM = {};
  for (const [year, monthsObj] of Object.entries(sortedTotals)) {
    for (const [mon, val] of Object.entries(monthsObj)) {
      const idx = MONTHS.indexOf(mon) + 1;
      const ym = `${year}-${String(idx).padStart(2, '0')}`;
      totalsYYYYMM[ym] = val;
    }
  }

  return { totalsByYear: sortedTotals, totalsYYYYMM };
}

export function parseExportsCSV(text) {
  if (!text) return [];

  // Find the starting index of the word "company"
  const keyword = "Company";
  const companyIndex = text.indexOf(keyword);

  // Check if "company" is found in the text
  if (companyIndex === -1) {
    return [];
  }

  // Slice the text from where "company" occurs
  const csvContent = text.slice(companyIndex).trim();

  // Parse the relevant part of the CSV content
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: header => header.trim(),
  });

  // Handle any parsing errors
  if (parseResult.errors.length > 0) {
  }

  // Process and clean the parsed data
  return processParsedResults(parseResult.data);
}

/**
 * Cleans and processes the parsed CSV results.
 *
 * @param {Array} data - Array of parsed data from CSV.
 * @returns {Array} - Processed and cleaned data.
 */
function processParsedResults(data) {
  return data.map(row => {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );
  });
}

/**
 * Parses an Excel file (XLSX) with multiple sheets and returns sheets separately.
 * Each sheet is parsed and returned as a separate array with its name.
 * 
 * @param {ArrayBuffer} arrayBuffer - The Excel file as an ArrayBuffer
 * @returns {Object} - Object with sheet names as keys and arrays of records as values
 */
export function parseExcel(arrayBuffer) {
  if (!arrayBuffer) return {};

  try {
    // Read the workbook from the array buffer
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    
    const sheetsData = {};
    
    // Iterate through all sheets
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert sheet to JSON with header row
      const sheetData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // Use array of arrays format first
        defval: '', // Default value for empty cells
        raw: false, // Convert values to strings
      });
      
      if (sheetData.length === 0) {
        sheetsData[sheetName] = [];
        return; // Skip empty sheets but include them
      }
      
      // Special handling for IRE sheet - header row is at index 5 (row 6 in Excel, 0-indexed as 5)
      let headerRowIndex = -1;
      if (sheetName.toUpperCase() === 'IRE') {
        // For IRE sheet, headers are in row 5 (0-indexed)
        // Row 0: "SUPPLIER REPORT" header
        // Row 1-2: Empty
        // Row 3: Supplier info
        // Row 4: Dates
        // Row 5: Actual headers ("Rank", "SKU", "Product", "Jan-25", etc.)
        // Row 6+: Data rows
        if (sheetData.length > 5) {
          headerRowIndex = 5;
        }
      }
      
      // For other sheets, find the header row (first non-empty row)
      if (headerRowIndex === -1) {
        for (let i = 0; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row && row.length > 0 && row.some(cell => cell && String(cell).trim() !== '')) {
            headerRowIndex = i;
            break;
          }
        }
      }
      
      if (headerRowIndex === -1) {
        sheetsData[sheetName] = [];
        return; // No header found
      }
      
      // Get headers and clean them
      const headers = sheetData[headerRowIndex].map((h, idx) => {
        const header = String(h || '').replace(/^\uFEFF/, '').trim();
        return header || `Column_${idx}`;
      });
      
      const records = [];
      
      // Process data rows
      for (let i = headerRowIndex + 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        
        // Skip completely empty rows
        if (!row || row.length === 0 || !row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
          continue;
        }
        
        // Create object from row
        const record = {};
        headers.forEach((header, index) => {
          const value = row[index];
          // Convert value to string and trim, handle null/undefined
          record[header] = value !== null && value !== undefined ? String(value).trim() : '';
        });
        
        records.push(record);
      }
      
      // Filter out empty records before storing
      sheetsData[sheetName] = filterEmptyRecords(records);
    });
    
    return sheetsData;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

// Company to country mapping for exports data
const COMPANY_TO_COUNTRY_MAP = {
  "Dreyfus": { "country": "usa", "iso2": "US" },
  "Maverick Beverage Company Texas": { "country": "usa", "iso2": "US" },
  "Boston wine Company": { "country": "usa", "iso2": "US" },
  "Vehrs Distributing Company": { "country": "usa", "iso2": "US" },
  "Breakthrough Beverage": { "country": "usa", "iso2": "US" },
  "Western Wine Services": { "country": "usa", "iso2": "US" },
  "Winebow Fine Wine": { "country": "usa", "iso2": "US" },
  "Western Carriers": { "country": "usa", "iso2": "US" },
  "Favourite Brands TX": { "country": "usa", "iso2": "US" },
  "Landmark": { "country": "usa", "iso2": "US" },
  "Coles Group Co Ltd": { "country": "au", "iso2": "AU" },
  "The Bond": { "country": "au", "iso2": "AU" },
  "Bacchus": { "country": "au", "iso2": "AU" },
  "Colonial Trade Co Ltd": { "country": "jap", "iso2": "JP" },
  "Degustation": { "country": "den", "iso2": "DK" },
  "Wine Express": { "country": "pol", "iso2": "PL" },
  "LCBO": { "country": "CA", "iso2": "CA" },
  "The Battle Store General Trading": { "country": "AE", "iso2": "AE" },
  "The Bottle Store": { "country": "AE", "iso2": "AE" },
  "Centaurus": { "country": "AE", "iso2": "AE" },
  "Curious Wines": { "country": "ire", "iso2": "IE" },
  "Decorum": { "country": "GB", "iso2": "GB" },
  "Quality Wine": { "country": "GB", "iso2": "GB" },
  "Jean Arnaud": { "country": "NL", "iso2": "NL" },
  "Sofresh": { "country": "GR", "iso2": "GR" },
  "Napa Cellar": { "country": "KR", "iso2": "KR" },
  "Avengere": { "country": "KR", "iso2": "KR" },
  "Don Remi": { "country": "PH", "iso2": "PH" },
  "Enoesa": { "country": "CL", "iso2": "CL" },
  "Francisco Merte": { "country": "nzl", "iso2": "NZ" },
  "PCL 201": { "country": "nzl", "iso2": "NZ" },
  "Wine Bitters": { "country": "nzl", "iso2": "NZ" }
};

/**
 * Gets country code from company name using the mapping
 * @param {string} companyName - Company or customer name
 * @returns {string} - Normalized country code (e.g., "usa", "au") or empty string
 */
function getCountryFromCompany(companyName) {
  if (!companyName || typeof companyName !== 'string') return '';
  
  const normalizedCompany = companyName.trim();
  // Exact match first
  if (COMPANY_TO_COUNTRY_MAP[normalizedCompany]) {
    return COMPANY_TO_COUNTRY_MAP[normalizedCompany].country;
  }
  
  // Try case-insensitive exact match
  for (const [key, value] of Object.entries(COMPANY_TO_COUNTRY_MAP)) {
    if (key.toLowerCase() === normalizedCompany.toLowerCase()) {
      return value.country;
    }
  }
  
  // Try partial match (company name contains key or key contains company name)
  for (const [key, value] of Object.entries(COMPANY_TO_COUNTRY_MAP)) {
    const keyLower = key.toLowerCase();
    const companyLower = normalizedCompany.toLowerCase();
    
    // Check if company name contains the key (e.g., "Winebow NJ" contains "Winebow")
    if (companyLower.includes(keyLower) || keyLower.includes(companyLower)) {
      return value.country;
    }
    
    // Also check for common variations (remove parenthetical content)
    const keyBase = keyLower.split('(')[0].trim();
    const companyBase = companyLower.split('(')[0].trim();
    if (companyBase.includes(keyBase) || keyBase.includes(companyBase)) {
      return value.country;
    }
  }
  
  return '';
}

/**
 * Normalizes country codes from various formats to match filter values.
 * Maps Excel country codes (US, USA, NZ, AU, etc.) to filter codes (usa, nzl, au, etc.)
 * 
 * @param {string} countryCode - Country code from Excel (can be US, USA, NZ, AU, etc.)
 * @returns {string} - Normalized country code matching filter values (usa, nzl, au, etc.)
 */
/**
 * Maps wine type text to wine code (e.g., "SAUVIGNON BLANC" -> "SAB")
 * @param {string} wineTypeText - Wine type text to convert
 * @returns {string} - Wine code (SAB, PIN, CHR, etc.) or original text if no match
 */
export function normalizeWineTypeToCode(wineTypeText) {
  if (!wineTypeText || typeof wineTypeText !== 'string') return '';
  
  const normalized = wineTypeText.trim().toUpperCase();
  
  // Wine type text to code mapping
  const wineTypeMap = {
    'SAUVIGNON BLANC': 'SAB',
    'PINOT NOIR': 'PIN',
    'CHARDONNAY': 'CHR',
    'ROSE': 'ROS',
    'PINOT GRIS': 'PIG',
    'GRUNER VELTLINER': 'GRU',
    'LATE HARVEST SAUVIGNON': 'LHS',
    'RIESLING': 'RIES'
  };
  
  // Direct match
  if (wineTypeMap[normalized]) {
    return wineTypeMap[normalized];
  }
  
  // Check if text contains any wine type (for partial matches)
  for (const [wineType, code] of Object.entries(wineTypeMap)) {
    if (normalized.includes(wineType) || wineType.includes(normalized)) {
      return code;
    }
  }
  
  // Check for common variations
  if (normalized.includes('SAUVIGNON') || normalized.includes('SAUV BLANC')) {
    return 'SAB';
  }
  if (normalized.includes('PINOT NOIR') || normalized.includes('PINOT')) {
    if (normalized.includes('GRIS') || normalized.includes('GRIGIO')) {
      return 'PIG';
    }
    return 'PIN';
  }
  if (normalized.includes('CHARDONNAY') || normalized.includes('CHARD')) {
    return 'CHR';
  }
  if (normalized.includes('ROSE') || normalized.includes('ROSÉ')) {
    return 'ROS';
  }
  if (normalized.includes('GRUNER') || normalized.includes('GRÜNER') || normalized.includes('VELTLINER')) {
    return 'GRU';
  }
  if (normalized.includes('LATE HARVEST')) {
    return 'LHS';
  }
  if (normalized.includes('RIESLING')) {
    return 'RIES';
  }
  
  // Return original if no match found
  return normalized;
}

export function normalizeCountryCode(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return '';
  
  const normalized = countryCode.trim().toUpperCase();
  
  // Country code mapping: Excel format -> Filter format
  const countryMap = {
    // USA variations
    'US': 'usa',
    'USA': 'usa',
    'UNITED STATES': 'usa',
    'UNITED STATES OF AMERICA': 'usa',
    
    // Australia variations
    'AU': 'au',
    'AUS': 'au',
    'AUSTRALIA': 'au',
    'AU-B': 'au-b',
    'AU-C': 'au-c',
    'AUB': 'au-b',
    'AUC': 'au-c',
    
    // New Zealand variations
    'NZ': 'nzl',
    'NZL': 'nzl',
    'NEW ZEALAND': 'nzl',
    
    // Japan variations
    'JP': 'jap',
    'JPN': 'jap',
    'JAPAN': 'jap',
    
    // Denmark variations
    'DK': 'den',
    'DNK': 'den',
    'DENMARK': 'den',
    
    // Poland variations
    'PL': 'pol',
    'POL': 'pol',
    'POLAND': 'pol',
    
    // Ireland variations
    'IE': 'ire',
    'IRL': 'ire',
    'IRELAND': 'ire',
    'IRE': 'ire',
    
    // Additional market codes from Product Description (SKU)
    'KO': 'ko', // Korea
    'ROW': 'row', // Rest of world
    'GR': 'gr', // Greece
    'UK': 'uk', // United Kingdom
    'C/S': 'cs', // Cleanskin
    'CLEANSKIN': 'cs',
    'PHI': 'phi', // Philippines
    'UEA': 'uea', // United Arab Emirates
    'SG': 'sg', // Singapore
    'TAI': 'tai', // Taiwan
    'HK': 'hk', // Hong Kong
    'MAL': 'mal', // Malaysia
    'CA': 'ca', // Canada
    'NE': 'ne', // Netherlands
    'TH': 'th', // Thailand
    'DE': 'den', // Denmark (already mapped but adding for clarity)
  };
  
  // Direct match (exact match first - highest priority)
  if (countryMap[normalized]) {
    return countryMap[normalized];
  }
  
  // Handle market codes that might appear twice (use second one)
  // e.g., "AU/C KO" should use "KO"
  const parts = normalized.split(/\s+/);
  if (parts.length > 1) {
    // Check each part for exact match
    for (const part of parts.reverse()) { // Check from last to first
      if (countryMap[part]) {
        return countryMap[part];
      }
    }
  }
  
  // Partial match - but prioritize longer/more specific codes first
  // Sort by length descending to match 'AU-B' before 'AU'
  const sortedCodes = Object.entries(countryMap).sort((a, b) => b[0].length - a[0].length);
  for (const [excelCode, filterCode] of sortedCodes) {
    // Only match if it's a word boundary match (not just substring)
    // This prevents 'AU' from matching 'AU-B'
    if (normalized === excelCode || 
        normalized.startsWith(excelCode + '-') ||
        normalized.startsWith(excelCode + '_') ||
        normalized.startsWith(excelCode + '/') ||
        normalized.endsWith('-' + excelCode) ||
        normalized.endsWith('_' + excelCode) ||
        normalized.endsWith('/' + excelCode)) {
      return filterCode;
    }
  }
  
  // If no match found, return lowercase version for consistency
  return normalized.toLowerCase();
}

/**
 * Parses Product Description (SKU) column into components.
 * Format: Brand Vintage Variety Market CaseSize BottleVolume
 * Example: JT 22 SAB AU/B 12pck 750ml
 * 
 * @param {string} sku - Product Description (SKU) string
 * @returns {Object} - Parsed components: { brand, vintage, variety, market, caseSize, bottleVolume, fullSKU }
 */
export function parseProductSKU(sku, opts = {}) {
  if (!sku || typeof sku !== "string") {
    return {
      brand: "",
      brandCode: "",
      vintage: "",
      vintageCode: "",
      variety: "",
      varietyCode: "",
      market: "",
      marketCode: "",
      caseSize: "",
      caseSizeCode: "",
      bottleVolume: "",
      bottleVolumeCode: "",
      packBottles: null,
      fullSKU: ""
    };
  }

  const cleaned = sku.trim();
  const U = cleaned.toUpperCase().trim();

  // Mappings
  const brandMap = {
    JT: "Jules Taylor",
    TBH: "The Better Half",
    BH: "The Better Half",
    OTQ: "On the Quiet"
  };

  const varietyMap = {
    SAB: "Sauvignon Blanc",
    CHR: "Chardonnay",
    ROS: "Rose",
    PIN: "Pinot Noir",
    PIG: "Pinot Gris",
    GRU: "Gruner Veltliner",
    LHS: "Late Harvest Sauvignon",
    RIES: "Riesling"
  };

  const MARKET_TOKENS = new Set([
    "US","USA","NZ","NZL","ROW","KO","GR","UK","C/S","PHI","UEA","SG","TAI","POL","HK","MAL","CA","NE","TH","DE",
    "JPN","JP","IRE","IE","AU/B","AU/C","AU-B","AU-C"
  ]);

  const caseSizeMap = { "6PCK":"6 pack", "12PCK":"12 pack", "SINGLE":"Single" };
  const bottleVolumeMap = { "1500":"Magnum", "375":"Demi", "750":"Regular", "750ML":"Regular" };

  // Tokenize (split spaces AND slash/comma so "750ML/12P" becomes two tokens)
  const rawTokens = U.split(/\s+/).filter(Boolean);
  const tokens = rawTokens
    .flatMap(t => t.split(/[\/,]/g))
    .map(t => t.trim())
    .filter(Boolean);

  // BRAND
  const brandAliases = { JT: "JT", JTW: "JT", TBH: "TBH", BH: "TBH", OTQ: "OTQ" };
  let brandCode = "";
  for (const t of tokens) {
    if (brandAliases[t]) { brandCode = brandAliases[t]; break; }
  }
  const brandDisplay = brandMap[brandCode] || brandCode;

  // VINTAGE (prefer 2-digit tokens; allow 4-digit)
  let vintageCode = "";
  for (const t of tokens) {
    if (/^\d{2}$/.test(t)) { vintageCode = t; break; }
    if (/^\d{4}$/.test(t)) { vintageCode = t.slice(2); break; }
  }
  let fullVintage = "";
  if (vintageCode) {
    const yy = parseInt(vintageCode, 10);
    fullVintage = yy >= 50 ? `19${vintageCode}` : `20${vintageCode}`;
  }

  // VARIETY CODE
  const VARIETY_CODES = Object.keys(varietyMap); // <-- single source of truth
  let varietyCode = "";
  for (const t of tokens) {
    if (VARIETY_CODES.includes(t)) { varietyCode = t; break; }
    if (t === "ROSE") { varietyCode = "ROS"; break; }
  }

  // fallback from text
  if (!varietyCode) {
    const packedNoSpace = U.replace(/\s+/g, "");
    if (packedNoSpace.includes("SAUVIGNON")) varietyCode = "SAB";
    else if (packedNoSpace.includes("CHARD")) varietyCode = "CHR";
    else if (packedNoSpace.includes("GRUNER") || packedNoSpace.includes("VELTLINER")) varietyCode = "GRU";
    else if (packedNoSpace.includes("LATEHARVEST")) varietyCode = "LHS";
    else if (packedNoSpace.includes("RIESLING")) varietyCode = "RIES";
    else if (packedNoSpace.includes("PINOTGRIS") || packedNoSpace.includes("GRIGIO")) varietyCode = "PIG";
    else if (packedNoSpace.includes("PINOT")) varietyCode = "PIN";
    else if (packedNoSpace.includes("ROSE") || packedNoSpace.includes("ROSÉ")) varietyCode = "ROS";
  }

  // MARKET (pick LAST market token)
  let marketCode = "";
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (MARKET_TOKENS.has(t)) { marketCode = t; break; }
  }

  // PACK SIZE (supports 12pk, 12pck, 750ml/12p, 6x750ml, etc.)
  const packed = U.replace(/\s+/g, ""); // keep "/" for /12P formats
  let packBottles = null;

  // 12PK / 12PCK / 12PACK / 12P (incl /12P)
  let m = packed.match(/(?:\/)?(\d{1,2})(?:PCK|PK|PACK|P)\b/);
  if (m) packBottles = Number(m[1]);

  // 6X750ML / 12X750ML etc
  if (!packBottles) {
    m = packed.match(/(\d{1,2})X\d{3,4}ML\b/);
    if (m) packBottles = Number(m[1]);
  }

  // SINGLE keyword
  if (!packBottles && packed.includes("SINGLE")) packBottles = 1;

  // ✅ default to 12 if Units=Cases and no pack found
  const units = String(opts.units || "").trim().toLowerCase();
  if (!packBottles && units === "cases") packBottles = 12;

  // CASE SIZE CODE
  let caseSizeCode = "";
  if (packBottles === 6) caseSizeCode = "6PCK";
  else if (packBottles === 12) caseSizeCode = "12PCK";
  else if (packBottles === 1) caseSizeCode = "SINGLE";

  // BOTTLE VOLUME
  let bottleVolumeCode = "";
  const volMatch = packed.match(/(\d{3,4})ML\b/);
  if (volMatch) bottleVolumeCode = volMatch[1];
  if (!bottleVolumeCode && packed.includes("MAGNUM")) bottleVolumeCode = "1500";
  if (!bottleVolumeCode && packed.includes("DEMI")) bottleVolumeCode = "375";
  if (!bottleVolumeCode) bottleVolumeCode = "750";

  return {
    brand: brandDisplay,
    brandCode,
    vintage: fullVintage,
    vintageCode,
    variety: varietyMap[varietyCode] || varietyCode,
    varietyCode,
    market: normalizeCountryCode(marketCode),
    marketCode,
    caseSize: caseSizeMap[caseSizeCode] || caseSizeCode,
    caseSizeCode,
    bottleVolume: bottleVolumeMap[bottleVolumeCode] || `${bottleVolumeCode}ml`,
    bottleVolumeCode,
    packBottles,
    fullSKU: cleaned
  };
}



/**
 * Checks if a record/object is empty (all values are empty/null/undefined)
 * 
 * @param {Object} record - Record to check
 * @returns {boolean} - True if record is empty
 */
function isEmptyRecord(record) {
  if (!record || typeof record !== 'object') return true;
  
  const values = Object.values(record);
  // Filter out metadata fields that start with _
  const dataValues = values.filter((_, idx) => {
    const key = Object.keys(record)[idx];
    return !key || !key.startsWith('_');
  });
  
  // Check if all data values are empty
  return dataValues.length === 0 || dataValues.every(v => {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return isNaN(v) || v === 0;
    return false;
  });
}

/**
 * Filters out empty records from an array
 * 
 * @param {Array} records - Array of records to filter
 * @returns {Array} - Filtered array without empty records
 */
function filterEmptyRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(record => !isEmptyRecord(record));
}

/**
 * Parses NZL sheet - Monthly sales by Brand, Variety, Channel
 * Structure: Country, State, Year, Month, Brand, Variety, Channel, Month Sales 9LE
 */
function parseNZLSheet(records) {
  return records
    .filter(r => r.Country && r.Brand && r['Month Sales 9LE'])
    .map(r => {
      const country = String(r.Country || '').trim();
      const brand = String(r.Brand || '').trim();
      const variety = String(r.Variety || '').trim();
      const channel = String(r.Channel || '').trim();
      const sales = parseFloat(String(r['Month Sales 9LE'] || '0').replace(/,/g, '')) || 0;
      const month = String(r.Month || '').trim();
      const year = String(r.Year || '').trim();
      
      return {
        AdditionalAttribute2: normalizeCountryCode(country), // Normalized country code (nzl)
        AdditionalAttribute3: normalizeWineTypeToCode(variety), // Wine code (SAB, PIN, etc.)
        ProductName: `${brand} ${variety}`.trim(), // Product name
        Location: channel.toUpperCase(), // Location (Channel only, no country prefix)
        Available: sales, // Sales quantity (depletion)
        _month: month,
        _year: year,
        _channel: channel,
        _originalCountry: country // Keep original for reference
      };
    })
    .filter(record => !isEmptyRecord(record)); // Filter empty records
}

/**
 * Parses AU-B sheet - Transaction-level sales data
 * Structure: Wine Name, Quantity - Cartons, Customer/Project, State, etc.
 */
function parseAUBSheet(records, sheetName = "AU-B") {
  const filteredRecords = (records || []).filter(r =>
    r && typeof r === "object" &&
    Object.values(r).some(v => v != null && String(v).trim() !== "")
  );

  return filteredRecords
    .filter(r => r["Wine Name"] && r["Quantity - Cartons"])
    .map(r => {
      const wineName = String(r["Wine Name"] || "").trim();
      const quantity =
        parseFloat(String(r["Quantity - Cartons"] || "0").replace(/,/g, "")) || 0;

      const customer = String(r["Customer/Project"] || "").trim();
      const rawState = String(r.State || r.state || "").trim(); // whatever is in the file
      const month = String(r.Month || "").trim();
      const year = String(r.Year || "").trim();

      // ✅ normalize AU state code for filtering (NSW/VIC/QLD/...)
      const stateNorm = typeof normalizeAusState === "function"
        ? normalizeAusState(rawState)
        : rawState.toUpperCase();

      // ✅ wine type code (SAB/PIN/PIG/etc)
      const wineTypeCode = normalizeWineTypeToCode(wineName);

      // ✅ brand for filtering (jtw/tbh/otq)
      const brandCanon = normalizeBrandToCode(wineName); // "JT" | "TBH" | "OTQ" | ""
      const brandForFilter =
        brandCanon === "JT" ? "jtw" :
        brandCanon === "TBH" ? "tbh" :
        brandCanon === "OTQ" ? "otq" :
        brandCanon ? brandCanon.toLowerCase() :
        "";

      const brandDisplay = BRAND_NAME_MAP?.[brandCanon] || "";

      // keep your current Location format: "STATE_customer"
      const location = rawState
        ? `${rawState}_${customer}`.substring(0, 50)
        : customer.substring(0, 50);

      return {
        AdditionalAttribute2: "au-b",
        AdditionalAttribute3: wineTypeCode,

        ProductName: wineName,
        Location: location,
        Available: quantity,

        // ✅ state fields for dropdown/filter
        State: stateNorm || null,
        AdditionalAttribute4: stateNorm || null,
        _state: stateNorm || null,

        // ✅ brand fields so brand filtering stays consistent
        Brand: brandDisplay || null,
        BrandCode: brandForFilter || null,

        _month: month,
        _year: year,
        _customer: customer,
        _sheetName: sheetName,
      };
    })
    .filter(record => !isEmptyRecord(record));
}


/**
 * Parses USA sheet - Monthly sales by State and Wine
 * Structure: Row 1 has month headers (Jan-25, Feb-25, etc.)
 * Row 2 has sub-headers, Row 3+ has data: Country, State, Wine Name, monthly values
 */
function parseUSASheet(records) {
  const normalized = [];
  
  // Find header row with months
  let headerRowIndex = -1;
  let monthColumns = [];
  
  for (let i = 0; i < Math.min(4, records.length); i++) {
    const row = records[i];
    if (!row || typeof row !== 'object') continue;
    
    // Check if this row has month headers
    const keys = Object.keys(row);
    const monthKeys = keys.filter(k => k.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/));
    
    if (monthKeys.length > 0) {
      headerRowIndex = i;
      monthColumns = monthKeys.map(k => ({
        key: k,
        month: k.split('-')[0],
        year: '20' + k.split('-')[1]
      }));
      break;
    }
  }
  if (monthColumns.length === 0) {
    // Fallback: try to find months in column names
    if (records.length > 0) {
      const firstRecord = records[0];
      Object.keys(firstRecord).forEach(key => {
        const match = key.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/);
        if (match) {
          monthColumns.push({
            key: key,
            month: match[1],
            year: '20' + key.split('-')[1]
          });
        }
      });
    }
  }
  
  // Process data rows (skip header rows)
  records.forEach((r, rowIndex) => {
    // Skip header rows
    if (rowIndex <= (headerRowIndex >= 0 ? headerRowIndex + 1 : 1)) return;
    // The structure is: Country, State, Wine Name, monthly values
    const values = Object.values(r);
    const state = values[1] ? String(values[1]).trim() : '';
    const wineName = values[3] ? String(values[3]).trim() : '';
    // Skip totals and invalid rows
    if (!state || state === 'Total' || state === 'STATE' || !wineName || wineName === 'Total' || wineName === 'Wines') {
      return;
    }
    // Process each month column
    monthColumns.forEach(({ key, month, year }) => {
      const value = parseFloat(String(r[key] || '0').replace(/,/g, '')) || 0;
      
      if (value > 0) {
          normalized.push({
            AdditionalAttribute2: normalizeCountryCode('USA'), // Normalized country code (usa)
            AdditionalAttribute3: normalizeWineTypeToCode(wineName), // Wine code (SAB, PIN, etc.)
            ProductName: wineName.trim(), // Product name
            Location: state.toUpperCase(), // Location (State)
            Available: value, // Monthly sales (depletion)
            _month: month,
            _year: year
          });
      }
    });
  });
  
  // Filter out empty records before returning
  return filterEmptyRecords(normalized);
}

/**
 * Parses IRE sheet - Supplier report
 * Structure: 
 * - Row 0: "SUPPLIER REPORT" header text
 * - Row 1-2: Empty or dates
 * - Row 3: Headers (Rank, SKU, Product, Sales 2024, Retail, Trade, Jan-25, Feb-25, ..., Dec-25, Sales 2025, ...)
 * - Row 4+: Data rows
 * 
 * Note: parseExcel now uses row 3 (index 3) as headers for IRE sheet, so records will have keys like:
 * "Rank", "SKU", "Product", "Sales 2024", "Retail", "Trade", "Jan-25", "Feb-25", ..., "Dec-25", etc.
 */
function parseIRESheet(records) {
  // Filter out completely empty records
  const filteredRecords = records.filter(r => {
    if (!r || typeof r !== 'object') return false;
    return Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== '');
  });
  
  const normalized = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Map of column names to month (based on the structure: Jan-25, Feb-25, ..., Dec-25)
  // The actual structure has columns: Rank, SKU, Product, Sales 2024, Retail, Trade, Jan-25, Feb-25, ..., Dec-25
  const monthColumnMap = {
    'Jan-25': { month: 'Jan', year: '2025' },
    'Feb-25': { month: 'Feb', year: '2025' },
    'Mar-25': { month: 'Mar', year: '2025' },
    'Apr-25': { month: 'Apr', year: '2025' },
    'May-25': { month: 'May', year: '2025' },
    'Jun-25': { month: 'Jun', year: '2025' },
    'Jul-25': { month: 'Jul', year: '2025' },
    'Aug-25': { month: 'Aug', year: '2025' },
    'Sept-25': { month: 'Sep', year: '2025' }, // Note: header uses "Sept-25" but we normalize to "Sep"
    'Sep-25': { month: 'Sep', year: '2025' },
    'Oct-25': { month: 'Oct', year: '2025' },
    'Nov-25': { month: 'Nov', year: '2025' },
    'Dec-25': { month: 'Dec', year: '2025' }
  };
  
  filteredRecords.forEach(r => {
    // Extract fields using the correct column names (row 3 headers)
    const rank = String(r['Rank'] || r['SUPPLIER REPORT'] || '').trim();
    const sku = String(r['SKU'] || r['__EMPTY'] || '').trim();
    const product = String(r['Product'] || r['__EMPTY_1'] || '').trim();
    
    // Skip if this looks like a header row (contains "Rank", "SKU", "Supplier", etc.)
    if (rank === 'Rank' || rank === 'Supplier' || !product || product === 'Product') {
      return;
    }
    
    // Skip if we don't have at least SKU or Product
    if (!sku && !product) {
      return;
    }
    
    // Skip if rank is not a number (valid data rows should have numeric ranks like "1", "2", etc.)
    if (rank && isNaN(parseInt(rank))) {
      return;
    }
    
    // Get product name (prefer SKU for code, Product for name)
    const productCode = product.toUpperCase();
    const productName = product || sku;
    
    // Process monthly columns (Jan-25 through Dec-25)
    Object.keys(monthColumnMap).forEach(colKey => {
      const monthInfo = monthColumnMap[colKey];
      const value = r[colKey];
      
      // Parse the value (remove commas, handle empty/null)
      const salesValue = value ? parseFloat(String(value).replace(/,/g, '')) : 0;
      
      if (salesValue > 0) {
        normalized.push({
          AdditionalAttribute2: 'ire', // Ireland country code
          AdditionalAttribute3: normalizeWineTypeToCode(productCode), // Wine code (SAB, PIN, etc.)
          ProductName: productName.trim(), // Product name
          Location: 'IRELAND', // Location (all from Ireland)
          Available: salesValue, // Monthly sales (depletion)
          _month: monthInfo.month,
          _year: monthInfo.year,
          _sku: sku,
          _rank: rank,
          _sheetName: 'IRE'
        });
      }
    });
  });
  
  return filterEmptyRecords(normalized);
}

function parseAUCSheet(records) {
  // Filter out completely empty records
  const filteredRecords = records.filter(r => {
    if (!r || typeof r !== "object") return false;
    return Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== "");
  });

  const normalized = [];

  // AU-C months: Mar-25 -> Feb-26
  const monthColumnMap = {
    "Mar-25": { month: "Mar", year: "2025" },
    "Apr-25": { month: "Apr", year: "2025" },
    "May-25": { month: "May", year: "2025" },
    "Jun-25": { month: "Jun", year: "2025" },
    "Jul-25": { month: "Jul", year: "2025" },
    "Aug-25": { month: "Aug", year: "2025" },
    "Sep-25": { month: "Sep", year: "2025" },
    "Sept-25": { month: "Sep", year: "2025" }, // handle Sept spelling
    "Oct-25": { month: "Oct", year: "2025" },
    "Nov-25": { month: "Nov", year: "2025" },
    "Dec-25": { month: "Dec", year: "2025" },
    "Jan-26": { month: "Jan", year: "2026" },
    "Feb-26": { month: "Feb", year: "2026" },
  };

  filteredRecords.forEach(r => {
    // Try to find Item column robustly (some exports might use "ITEM" or "Item ")
    const item =
      String(r["Item"] ?? r["ITEM"] ?? r["item"] ?? "").trim();

    // Skip obvious header rows / blanks
    if (!item || item.toUpperCase() === "ITEM") return;

    // If AU-C has banner too, use it, otherwise default
    const banner =
      String(r["Banner"] ?? r["BANNER"] ?? r["banner"] ?? "").trim();

    // Process month columns
    Object.keys(monthColumnMap).forEach(colKey => {
      const monthInfo = monthColumnMap[colKey];
      const value = r[colKey];

      // Parse numeric (strip commas etc.)
      const qty = value ? parseFloat(String(value).replace(/,/g, "")) : 0;

      if (qty > 0) {
        normalized.push({
          AdditionalAttribute2: "au-c",
          AdditionalAttribute3: normalizeWineTypeToCode(item), // simple: infer wine type from item text
          ProductName: item,
          Location: banner ? banner.toUpperCase() : "AU-C",
          Available: qty,
          _month: monthInfo.month,
          _year: monthInfo.year,
          _sheetName: "AU-C",
          _originalData: r,
        });
      }
    });
  });

  return filterEmptyRecords(normalized);
}



/**
 * Normalizes distributor stock/depletion data from different sheet structures to a common format.
 * Uses sheet-specific parsers based on sheet name.
 * 
 * NOTE: The Excel file "Depletion Summary - All Markets.xlsx" contains SALES/DEPLETION data,
 * not actual stock levels. The "Available" field in the normalized output represents
 * sales/depletion quantities, which can be used for forecasting and analysis.
 * 
 * Sheet structures:
 * - NZL: Monthly sales by Brand, Variety, Channel (Country, State, Year, Month, Brand, Variety, Channel, Month Sales 9LE)
 * - AU-B: Transaction-level sales (Wine Name, Quantity - Cartons, Customer/Project, State, etc.)
 * - AU-C: Sales by Banner and Item (Banner, Item, Sales Qty (Singles))
 * - USA: Monthly sales by State and Wine (Country, State, Wine Name, monthly columns Jan-25, Feb-25, etc.)
 * - IRE: Supplier report (structure to be determined)
 * 
 * @param {Array} records - Array of records from a sheet
 * @param {string} sheetName - Name of the sheet (determines parser: NZL, AU-B, AU-C, USA, IRE)
 * @returns {Array} - Normalized records with standard field names:
 *   - AdditionalAttribute2: Country code
 *   - AdditionalAttribute3: Wine/Product code
 *   - ProductName: Product name
 *   - Location: Distributor/Location identifier
 *   - Available: Sales/Depletion quantity (NOT actual stock)
 */
export function normalizeSalesData(records, sheetName = '') {
  if (!Array.isArray(records) || records.length === 0) return [];
  // Use sheet-specific parsers
  const upperSheetName = sheetName.toUpperCase();
  if (upperSheetName.includes("AU-C") || upperSheetName === "AUC") {
    console.groupCollapsed("[normalizeSalesData] AU-C entry");
    console.log("sheetName:", JSON.stringify(sheetName));
    console.log("records length:", Array.isArray(records) ? records.length : "not_array");
    const first = Array.isArray(records) ? records.find(r => r && typeof r === "object") : null;
    console.log("first keys:", first ? Object.keys(first) : null);
    console.groupEnd();
  }
  
  if (upperSheetName === 'NZL') {
    return parseNZLSheet(records);
  } else if (upperSheetName === 'AU-B' || upperSheetName === 'AUB') {
    return parseAUBSheet(records);
  } else if (upperSheetName === 'AU-C' || upperSheetName === 'AUC') {
    return parseAUCSheet(records);
  } else if (upperSheetName === 'USA') {
    return parseUSASheet(records);
  } else if (upperSheetName === 'IRE') {
    return parseIRESheet(records);
  }
  
  // Fallback: Generic parser for unknown sheet structures
  const columnMappings = {
    'AdditionalAttribute2': ['AdditionalAttribute2', 'Country', 'Country Code', 'Region', 'Market', 'CountryCode'],
    'AdditionalAttribute3': ['AdditionalAttribute3', 'Variety', 'Wine Name', 'Product Code', 'Wines', 'SKU', 'Code', 'Item'],
    'ProductName': ['ProductName', 'Product Name', 'Product', 'Wine Name', 'WineName', 'Item', 'Description', 'Brand', 'Variety'],
    'Location': ['Location', 'Distributor', 'Distributor Name', 'DistributorName', 'Warehouse', 'Site', 'Customer/Project', 'Banner', 'State', 'Channel'],
    'Available': ['Available', 'Available Stock', 'AvailableStock', 'Stock', 'Quantity', 'Qty', 'On Hand', 'OnHand', 'Current Stock', 'CurrentStock', 'Quantity - Cartons', 'Month Sales 9LE', 'Sales Qty (Singles)']
  };
  const findColumnValue = (record, possibleNames) => {
    const recordKeys = Object.keys(record);
    for (const name of possibleNames) {
      const foundKey = recordKeys.find(key => 
        key.toLowerCase().trim() === name.toLowerCase().trim()
      );
      if (foundKey !== undefined) {
        const value = record[foundKey];
        // Try to parse as number if it looks like a number
        if (typeof value === 'string' && value.match(/^[\d,]+\.?\d*$/)) {
          return parseFloat(value.replace(/,/g, '')) || value;
        }
        return value || '';
      }
    }
    return '';
  };
  return records
    .filter(r => {
      // Only include records that have at least some data
      return Object.values(r).some(v => v && String(v).trim() !== '');
    })
    .map(record => {
      const rawCountry = findColumnValue(record, columnMappings.AdditionalAttribute2) || sheetName;
      const normalized = {
        AdditionalAttribute2: normalizeCountryCode(rawCountry), // Normalize country code
        AdditionalAttribute3: findColumnValue(record, columnMappings.AdditionalAttribute3),
        ProductName: findColumnValue(record, columnMappings.ProductName),
        Location: findColumnValue(record, columnMappings.Location) || sheetName,
        Available: findColumnValue(record, columnMappings.Available) || 0,
        _sheetName: sheetName,
        _originalData: record,
        _originalCountry: rawCountry // Keep original for reference
      };
      
      return normalized;
    })
    .filter(record => !isEmptyRecord(record)); // Filter empty records
}

  function excelSerialToDate(n) {
    // Excel serial date -> JS Date (Excel "day 1" = 1899-12-31, with the 1900 leap-year bug).
    // Common, practical conversion:
    const utcDays = Math.floor(n - 25569); // 25569 = days between 1899-12-30 and 1970-01-01
    const utcMs = utcDays * 86400 * 1000;
    const date = new Date(utcMs);
    return isNaN(date.getTime()) ? null : date;
  }

  function parseExcelDateAny(v) {
    if (v == null || v === "") return null;

    // Already a Date
    if (v instanceof Date && !isNaN(v.getTime())) return v;

    // Excel serial number
    if (typeof v === "number" && Number.isFinite(v)) {
      return excelSerialToDate(v);
    }

    const s = String(v).trim();
    if (!s) return null;

    // Try native parse
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;

    // Try D/M/Y or M/D/Y, same logic you had, but works for any string
    const parts = s.split(/[\/\-]/);
    if (parts.length >= 3) {
      let month, day, year;

      if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        const third = parseInt(parts[2], 10);

        if (first > 12 && second <= 12) {
          // D/M/Y
          day = first;
          month = second - 1;
          year = third;
        } else {
          // M/D/Y (fallback)
          month = first - 1;
          day = second;
          year = third;
        }

        if (year < 100) year = year >= 50 ? 1900 + year : 2000 + year;
      }

      d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }

    return null;
  }

  function addMonthsSafe(date, months) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d;
  }

  function toPeriodKey(date, monthNames) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = monthNames[date.getMonth()]; // must match your monthsToDisplay labels
    return `${y}_${m}`;
  }

  // Lead-time months per your rule:
  function leadTimeMonthsForCountry(countryCode) {
    const c = String(countryCode || "").toLowerCase();

    // AU market = 1 month
    if (c === "au" || c === "au-b" || c === "au-c") return 1;

    // USA = 2 months
    if (c === "usa") return 2;

    // EU (example Ireland) = 3 months
    // You can expand this list if needed.
    if (c === "ire") return 3;

    // safe fallback (choose what you prefer)
    return 2;
  }

  function caseSizeToUnitFactor(caseSizeRaw) {
    const n = Number(String(caseSizeRaw || "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return 1; // default assume 12pk
    // 12 pack = 1 unit, 6 pack = 0.5 unit, etc.
    return n / 12;
  }

/**
 * Normalizes exports data from Excel file.
 * Expected output format: { Stock: wineCode, cases: quantity, Company: company, ... }
 * 
 * @param {Array} records - Array of records from a sheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Array} - Normalized records with Stock and cases fields
 */
export function normalizeExportsData(records, sheetName = '', monthNames = [
  "January","February","March","April","May","June","July","August","September","October","November","December"
]) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const normalized = [];

  
  // Find the row with "Company" or "Customer" header
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, records.length); i++) {
    const row = records[i];
    if (row && typeof row === 'object') {
      const values = Object.values(row);
      if (values.some(v => {
        const val = String(v).toUpperCase();
        return val.includes('COMPANY') || 
               val.includes('CUSTOMER') ||
               val.includes('PRODUCT DESCRIPTION') ||
               val.includes('STATUS');
      })) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  if (headerRowIndex < 0) {
    // Try to find headers in first few rows
    for (let i = 0; i < Math.min(5, records.length); i++) {
      const row = records[i];
      if (row && typeof row === 'object' && Object.keys(row).length > 3) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  if (headerRowIndex >= 0) {
    const headers = records[headerRowIndex];
    const headerKeys = Object.keys(headers);
    
    // Find column indices for key fields
    const findColumn = (searchTerms) => {
      for (const term of searchTerms) {
        const termUpper = term.toUpperCase().trim();
        if (!termUpper) continue;
        
        // First try to find by header value
        const key = headerKeys.find(k => {
          const headerVal = String(headers[k] || k).toUpperCase().trim();
          if (!headerVal) return false;
          
          // Priority 1: Exact match (most reliable)
          if (headerVal === termUpper) return true;
          
          // Priority 2: Header contains the full search term (but be more strict)
          // Only match if the term is substantial (at least 3 chars) and header contains it
          if (termUpper.length >= 3 && headerVal.includes(termUpper)) {
            // Additional check: ensure it's not a false match (e.g., "PO" matching "Export")
            // If the term is a single word or short, require it to be a word boundary match
            if (termUpper.length <= 5) {
              // For short terms, require word boundary or exact match
              const wordBoundaryRegex = new RegExp(`\\b${termUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              if (wordBoundaryRegex.test(headerVal)) return true;
            } else {
              // For longer terms, includes is usually safe
              return true;
            }
          }
          
          // Priority 3: Search term contains header (less reliable, but needed for partial matches)
          // Only if header is substantial and term contains it
          if (headerVal.length >= 3 && termUpper.includes(headerVal)) {
            return true;
          }
          
          // Priority 4: Word-part matching (for multi-word terms)
          // Split both by spaces/special chars and check if all significant parts match
          const headerParts = headerVal.split(/[\s_\-\(\)]+/).filter(p => p.length > 0);
          const termParts = termUpper.split(/[\s_\-\(\)]+/).filter(p => p.length > 0);
          
          // Only do word-part matching if both have multiple parts
          if (termParts.length > 1 && headerParts.length > 0) {
            // Check if all significant term parts (length >= 2) are found in header parts
            const significantTermParts = termParts.filter(tp => tp.length >= 2);
            if (significantTermParts.length > 0) {
              const allPartsMatch = significantTermParts.every(tp => 
                headerParts.some(hp => hp === tp || (hp.length >= 3 && hp.includes(tp)))
              );
              if (allPartsMatch) return true;
            }
          }
          
          return false;
        });
        
        if (key !== undefined) {
          // Return the key (which is the column identifier in the row object)
          return key;
        }
        
        // Also try to find by key name itself (in case the key IS the header text)
        // But be more strict here too
        const keyByName = headerKeys.find(k => {
          const keyUpper = String(k || '').toUpperCase().trim();
          if (!keyUpper) return false;
          // Only exact match or if key contains the term (not the other way around for short terms)
          if (keyUpper === termUpper) return true;
          if (termUpper.length >= 5 && keyUpper.includes(termUpper)) return true;
          return false;
        });
        if (keyByName !== undefined) return keyByName;
      }
      return null;
    };
    
    // Find all required columns
    const productDescCol = findColumn(['Product Description', 'Stock', 'Product Description (SKU)', 'Product', 'SKU', 'Item', 'Code']);
    const customerCol    = findColumn(['Company', 'Customer', 'Distributor']);
    const casesCol       = findColumn(['Cases']);
    const statusCol      = findColumn(['Status', 'Order Status', 'Shipment Status']);

    // Prefer Departing NZ first
    const departingNZCol = findColumn(["Departing NZ", "Departing", "Departure", "ETD"]);
    const shippedFromWWMCol = findColumn(["Shipped from WWM", "Date Shipped", "Shipped Date", "Shipped from", "Shipped"]);

    const dateShippedCol = departingNZCol || shippedFromWWMCol;

    const freightForwarderCol = findColumn(['Freight Forwarder','Freight','Forwarder','Carrier','Shipping Company']);

    // NEW: pull case size if present (your column N)
    const caseSizeCol = findColumn(['Case Size', 'CaseSize', 'Pack', 'Pack Size']);

    // NEW: Market and State columns for transit filtering by state
    const marketCol = findColumn(['Market', 'Destination Market', 'Destination Country']);
    const stateCol = findColumn(['State', 'Destination State', 'Ship State', 'Ship To State']);
 // -----------------------
    // Forward-fill context
    // -----------------------
    let currentCustomer = "";
    let currentDateShippedRaw = null;
    let currentDateShippedParsed = null;

    // DEBUG counters
    const debugBuckets = new Map(); // key: arrivalPeriodKey, value: total units

    for (let i = headerRowIndex + 1; i < records.length; i++) {
      const row = records[i];
      if (!row || typeof row !== "object") continue;

      // Read raw “order header” values even if this row has no product
      const rawCustomer = customerCol ? String(row[customerCol] || "").trim() : "";
      let rawDateShipped = dateShippedCol ? (row[dateShippedCol] ?? "") : "";

      // Update forward-fill context when present
      if (rawCustomer) currentCustomer = rawCustomer;

      // If shipping date cell is populated (string/number/date), update context
      if (rawDateShipped !== "" && rawDateShipped != null) {
        const parsed = parseExcelDateAny(rawDateShipped);
        if (parsed) {
          currentDateShippedRaw = rawDateShipped;
          currentDateShippedParsed = parsed;
        }
      }

      // Now process wine lines
      const productDesc = productDescCol ? String(row[productDescCol] || "").trim() : "";
      const casesRaw = casesCol ? String(row[casesCol] || "0").replace(/,/g, "") : "0";
      const cases = parseFloat(casesRaw) || 0;

      if (!productDesc || cases <= 0) continue;

      const status = statusCol ? String(row[statusCol] || "").trim().toLowerCase() : "";
      const freightForwarder = freightForwarderCol ? String(row[freightForwarderCol] || "").trim() : "";

      // Use forward-filled customer/date shipped if missing on wine line
      const customer = rawCustomer || currentCustomer || sheetName;

      const shippedDateObj = currentDateShippedParsed; // forward-filled parsed Date
      const dateShippedOut = shippedDateObj ? shippedDateObj.toISOString().slice(0, 10) : "";

 
      // Parse Product Description (SKU)
      const skuParts = parseProductSKU(productDesc);

      const brandCode = normalizeBrandToCode(
        skuParts.brandCode || skuParts.brand || row.Brand || productDesc
      );
      const brandDisplay = BRAND_NAME_MAP[brandCode] || (skuParts.brand || row.Brand || "");

      // Country from company mapping
      const countryCode = getCountryFromCompany(customer) || "nzl";

      // Convert cases into 12pk units using case size
      const caseSizeVal = caseSizeCol ? row[caseSizeCol] : null;
      const factor = caseSizeToUnitFactor(caseSizeVal); // 12 -> 1, 6 -> 0.5
      const casesUnits = cases * factor;

      // NEW: month bucketing
      const shipmentPeriodKey = shippedDateObj ? toPeriodKey(shippedDateObj, monthNames) : "";
      const leadMonths = leadTimeMonthsForCountry(countryCode);
      const arrivalPeriodKey = shippedDateObj ? toPeriodKey(addMonthsSafe(shippedDateObj, leadMonths), monthNames) : "";

      // DEBUG: show first ~30 wine lines and any missing shipped dates
      if (i < headerRowIndex + 40) {
        console.log("[EXPORT LINE]", {
          i,
          customer,
          countryCode,
          productDesc,
          casesRaw,
          caseSize: caseSizeVal,
          casesUnits,
          shippedDateObj: shippedDateObj ? shippedDateObj.toDateString() : null,
          shipmentPeriodKey,
          arrivalPeriodKey,
          leadMonths,
          status
        });
      }
      if (!shippedDateObj) {
        console.warn("[EXPORT WARN] wine line has NO shipped date after forward-fill", {
          i, customer, productDesc, casesRaw
        });
      }

      // Track bucket totals (sanity)
      if (arrivalPeriodKey) {
        debugBuckets.set(arrivalPeriodKey, (debugBuckets.get(arrivalPeriodKey) || 0) + casesUnits);
      }

      // Extract market and state from dedicated columns if available
      const exportMarket = marketCol ? normalizeCountryCode(String(row[marketCol] || "").trim()) : countryCode;
      const exportState = stateCol ? String(row[stateCol] || "").trim() : "";

      normalized.push({
        Stock: productDesc,
        ProductDescription: productDesc,
        ProductName: skuParts.brand ? `${skuParts.brand} ${skuParts.variety}`.trim() : "",

        Brand: brandDisplay,
        BrandCode: brandCode,
        Vintage: skuParts.vintage,
        Variety: skuParts.variety,
        VarietyCode: skuParts.varietyCode,
        Market: skuParts.market,
        MarketCode: skuParts.marketCode,

        Customer: customer,
        Company: customer,
        cases: casesUnits,
        _casesRaw: cases,
        _caseSize: caseSizeVal,
        Status: status,

        DateShipped: dateShippedOut,

        ShipmentPeriodKey: shipmentPeriodKey,
        ArrivalPeriodKey: arrivalPeriodKey,
        LeadMonths: leadMonths,

        FreightForwarder: freightForwarder,

        ExportMarket: exportMarket,
        State: exportState,

        AdditionalAttribute2: countryCode,
        AdditionalAttribute3: `${skuParts.vintage}`.toUpperCase(),

        _sheetName: sheetName,
        _originalData: row
      });
    }

    // BIG sanity log: totals by arrival month
    console.log("[EXPORT BUCKETS] total units by arrival month:");
    console.table(
      Array.from(debugBuckets.entries()).map(([k, v]) => ({ periodKey: k, units12pk: Math.round(v * 100) / 100 }))
    );
  }

  return filterEmptyRecords(normalized);
}

/**
 * Normalizes stock on hand data from Excel file.
 * Expected output format: Array of objects with product and stock information
 * 
 * @param {Array} records - Array of records from a sheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Array} - Normalized records
 */
export function normalizeWarehouseStockData(records, sheetName = '') {
  if (!Array.isArray(records) || records.length === 0) return [];
  
  const normalized = [];
  
  // Find header row (look for Product Description, SKU, On Hand, Available, etc.)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const row = records[i];
    if (row && typeof row === 'object') {
      const keys = Object.keys(row);
      const values = Object.values(row);
      if (values.some(v => {
        const val = String(v).toUpperCase();
        return val.includes('PRODUCT DESCRIPTION') || 
               val.includes('SKU') ||
               val.includes('WW CODE') || 
               val.includes('ON HAND') ||
               val.includes('AVAILABLE') ||
               val.includes('ALLOCATED') ||
               val.includes('PENDING');
      })) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  if (headerRowIndex >= 0) {
    const headers = records[headerRowIndex];
    const headerKeys = Object.keys(headers);
    
    // Find column indices
    const findColumn = (searchTerms) => {
      for (const term of searchTerms) {
        const key = headerKeys.find(k => {
          const headerVal = String(headers[k] || k).toUpperCase();
          return headerVal.includes(term.toUpperCase()) || term.toUpperCase().includes(headerVal);
        });
        if (key !== undefined) return key;
      }
      return null;
    };
    
    // Find Product Description (SKU) column - this is the key column
    const skuCol = findColumn(['Client Description', 'Product Description (SKU)', 'SKU', 'Product', 'Description']);
    const codeCol = findColumn(['WW Code', 'Code', 'Item Code', 'Product Code']);
    const onHandCol = findColumn(['On Hand', 'OnHand', 'Stock On Hand']);
    const allocatedCol = findColumn(['Allocated']);
    const pendingCol = findColumn(['Pending']);
    const availableCol = findColumn(['Available']);
    
    // Process data rows
    for (let i = headerRowIndex + 1; i < records.length; i++) {
      const row = records[i];
      if (!row || typeof row !== 'object') continue;
      
      // Get Product Description (SKU)
      const sku = skuCol ? String(row[skuCol] || '').trim() : '';
      const code = codeCol ? String(row[codeCol] || '').trim() : '';
      
      if (!sku && !code) continue; // Skip rows without SKU or code
      
      // Parse SKU to extract components
      const skuParts = parseProductSKU(sku || code);
      
      // Helper function to parse numeric values, handling currency symbols and formatting
      const parseNumericValue = (value) => {
        if (value === undefined || value === null || value === '') return 0;
        // Remove currency symbols ($, €, £, ¥), commas, and non-numeric characters (except decimal and minus)
        const cleaned = String(value)
          .replace(/[$€£¥,]/g, '') // Remove currency symbols and commas
          .replace(/[^\d.-]/g, '') // Remove any remaining non-numeric except decimal and minus
          .trim();
        return cleaned !== '' && !isNaN(cleaned) ? parseFloat(cleaned) : 0;
      };
      
      // Get stock values - use parseNumericValue to handle currency symbols and formatting
      const onHand = onHandCol ? parseNumericValue(row[onHandCol]) : 0;
      const allocated = allocatedCol ? parseNumericValue(row[allocatedCol]) : 0;
      const pending = pendingCol ? parseNumericValue(row[pendingCol]) : 0;
      
      // Calculate Available: On Hand - (Allocated + Pending)
      // If Available column exists, use it; otherwise calculate
      let available = 0;
      if (availableCol) {
        const rawAvailable = row[availableCol];
        // Use parseNumericValue to handle currency symbols ($, €, £, ¥) and formatting
        available = parseNumericValue(rawAvailable);
      }
      
      // If available column value is 0 or wasn't found, calculate it
      if (!availableCol || (available === 0 && onHand > 0)) {
        // Calculate: Available = On Hand - Allocated - Pending
        const calculatedAvailable = Math.max(0, onHand - allocated - pending);
        // Only use calculated value if we don't have a valid available column value
        if (!availableCol || available === 0) {
          available = calculatedAvailable;
        }
      }
      
      // Only include records with meaningful data
      if (sku || code) {
        normalized.push({
          // Product information
          Product: skuParts.brand ? `${skuParts.brand} ${skuParts.variety} ${skuParts.vintage}`.trim() : (sku || code),
          ProductName: skuParts.brand ? `${skuParts.brand} ${skuParts.variety}`.trim() : '',
          Code: code || skuParts.fullSKU,
          
          // SKU components
          Brand: skuParts.brand,
          BrandCode: skuParts.brandCode,
          Vintage: skuParts.vintage,
          Variety: skuParts.variety,
          VarietyCode: skuParts.varietyCode,
          Market: skuParts.market, // Normalized country code
          MarketCode: skuParts.marketCode,
          CaseSize: skuParts.caseSize,
          BottleVolume: skuParts.bottleVolume,
          
          // Stock information
          OnHand: onHand,
          Allocated: allocated,
          Pending: pending,
          AllocatedPending: allocated + pending, // Combined as per requirements
          Available: available, // Primary field - stock available for purchase
          
          // Additional fields for Dashboard compatibility
          AdditionalAttribute2: skuParts.market, // Normalized country code
          AdditionalAttribute3: `${skuParts.varietyCode}`.toUpperCase(),
          Location: 'WineWorks Marlborough', // Default location
          
          _sheetName: sheetName,
          _originalSKU: sku || code,
          _originalData: row
        });
      }
    }
  }
  
  // Filter out empty records before returning
  return filterEmptyRecords(normalized);
}

/**
 * Normalizes iDig sales data from Excel file.
 * Expected output format: { totalsByYear: { year: { month: value } } }
 * Similar to parseCSVWithPapa output format
 * 
 * @param {Object} sheetsData - Object with sheet names as keys and arrays of records as values
 * @returns {Object} - Normalized sales data in format { totalsByYear: {...}, totalsYYYYMM: {...} }
 */

/**
 * Normalizes distributor stock on hand data from Excel file.
 * This is different from warehouse stock - it represents stock at distributor locations.
 * Expected output format: Array of objects with distributor, product and stock information
 * 
 * @param {Array} records - Array of records from a sheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Array} - Normalized records
 */
/**
 * Normalize Distributor Stock On Hand data (DSOH)
 * - Keeps legacy behavior for NZ / USA / AU-B / IRE / other sheets
 * - Adds AU-C "pivot" support (multiple DC/state columns) WITHOUT breaking Brand filtering
 */
/**
 * Normalize Distributor Stock On Hand data (DSOH)
 * - Keeps legacy behavior for NZ / USA / AU-B / IRE / other sheets
 * - Adds AU-C "pivot" support (multiple DC/state columns) WITHOUT breaking Brand filtering
 * - ✅ NZ ONLY: if Pack column exists and is 6, converts OnHand to 12pk units by dividing by 2
 */
export function normalizeDistributorStockOnHandData(records, sheetName = "") {
  if (!Array.isArray(records) || records.length === 0) return [];

  const normalized = [];
  const distributorName = sheetName || "Unknown";
  const upperSheetName = String(sheetName || "").toUpperCase();

  // ---------- Find first non-empty record to get header keys ----------
  let firstRecord = null;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record && typeof record === "object" && Object.keys(record).length > 0) {
      firstRecord = record;
      break;
    }
  }
  if (!firstRecord) return [];

  const headerKeys = Object.keys(firstRecord);

  // ---------- helpers ----------
    // ---------- NZ Pack detection (robust) ----------
    const detectNZPackCol = ({
      records,
      headerKeys,
      findColumn,
      productCol,
      skuCol,
      countryCol,
      wineTypeCol,
      onHandCol,
    }) => {
      // 1) Best case: Pack is actually a key
      let col = findColumn(["Pack", "PACK", "Pk", "PK", "Pack Size", "Case Size", "CaseSize"]);
      if (col) return col;
  
      // 2) Header row might be VALUES (keys are Column_1, Column_2, ...)
      const headerRow =
        records.slice(0, 15).find(r =>
          r && typeof r === "object" &&
          Object.values(r).some(v => String(v || "").toUpperCase().includes("PACK"))
        ) || null;
  
      if (headerRow) {
        const k = Object.keys(headerRow).find(k =>
          String(headerRow[k] || "").toUpperCase().includes("PACK")
        );
        if (k) return k;
      }
  
      // 3) Heuristic: pick the column (excluding known ones) that looks like mostly 6/12
      let bestKey = null;
      let bestScore = 0;
  
      for (const k of headerKeys) {
        if (
          k === productCol ||
          k === skuCol ||
          k === countryCol ||
          k === wineTypeCol ||
          k === onHandCol
        ) continue;
  
        let seen = 0;
        let hits = 0;
  
        for (let i = 0; i < Math.min(records.length, 60); i++) {
          const v = records[i]?.[k];
          if (v == null || String(v).trim() === "") continue;
  
          seen++;
          const s = String(v).trim().toUpperCase();
          if (s === "6" || s === "12" || s.includes("6") || s.includes("12")) {
            // keep it strict-ish: only count if it's basically "6" or "12" (or "6PK"/"12PK")
            const n = parseInt(s.replace(/[^\d]/g, ""), 10);
            if (n === 6 || n === 12) hits++;
          }
        }
  
        const score = seen ? hits / seen : 0;
        if (hits >= 6 && score > bestScore) {
          bestScore = score;
          bestKey = k;
        }
      }
  
      return bestKey;
    };
  
  const parseNumericValue = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    const cleaned = String(value)
      .replace(/[$€£¥,]/g, "")
      .replace(/[^\d.-]/g, "")
      .trim();
    const parsed = cleaned !== "" && !isNaN(cleaned) ? parseFloat(cleaned) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const findColumn = (searchTerms) => {
    for (const term of searchTerms) {
      const key = headerKeys.find((k) => {
        const headerVal = String(k || "").toUpperCase().trim();
        const termUpper = String(term || "").toUpperCase().trim();

        if (headerVal === termUpper) return true;
        if (headerVal.includes(termUpper) || termUpper.includes(headerVal)) return true;
        if (headerVal.replace(/\s+/g, "") === termUpper.replace(/\s+/g, "")) return true;

        const a = headerVal.replace(/_/g, " ");
        const b = termUpper.replace(/_/g, " ");
        if (a === b) return true;

        return false;
      });
      if (key !== undefined) return key;
    }
    return null;
  };

  const extractStateFromDCLabel = (s) => {
    const m = String(s || "").toUpperCase().match(/\b(NSW|VIC|QLD|SA|WA)\b/);
    return m ? m[1] : "";
  };

  // ============================================================
  // ✅ AU-C pivot support (NEW), isolated branch
  // ============================================================
  const looksLikeAUCByHeaders =
    headerKeys.some((k) => /\bDC\b/i.test(String(k))) &&
    headerKeys.some((k) => /\bNSW\b/i.test(String(k))) &&
    headerKeys.some((k) => /\bVIC\b/i.test(String(k)));

  const isAUC =
    upperSheetName === "AU-C" ||
    upperSheetName === "AUC" ||
    upperSheetName.includes("AU-C") ||
    looksLikeAUCByHeaders;

  if (isAUC) {
    const itemCol =
      findColumn(["Item", "Product", "Description", "Product Description", "Wine", "Wine Name"]) ||
      headerKeys[0];

    const dcCols = headerKeys
      .filter((k) => k !== itemCol)
      .filter((k) => {
        const s = String(k || "");
        return /\b(NSW|VIC|QLD|SA|WA)\b/i.test(s) || /\bDC\b/i.test(s);
      });

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      if (!row || typeof row !== "object") continue;

      const item = String(row[itemCol] ?? "").trim();
      if (!item) continue;

      const upperItem = item.toUpperCase();
      if (
        upperItem.includes("CURRENT QUANTITY") ||
        upperItem === "ITEM" ||
        upperItem === "DESCRIPTION"
      ) {
        continue;
      }

      const skuParts = parseProductSKU(item);

      let wineTypeCode = normalizeWineTypeToCode(item);
      if (!wineTypeCode || wineTypeCode.length > 10) {
        wineTypeCode = normalizeWineTypeToCode(skuParts.varietyCode || skuParts.fullSKU || item);
      }

      let additionalAttribute3 = "";
      if (wineTypeCode && wineTypeCode.length <= 10) {
        additionalAttribute3 = wineTypeCode;
      } else {
        const fallbackWineType = normalizeWineTypeToCode(item);
        if (fallbackWineType && fallbackWineType.length <= 10) {
          additionalAttribute3 = fallbackWineType;
        } else {
          const fallbackWineCode =
            skuParts.fullSKU ||
            `${skuParts.brandCode}_${skuParts.varietyCode}_${skuParts.vintageCode}`.toUpperCase();
          additionalAttribute3 = fallbackWineCode;
        }
      }

      for (const c of dcCols) {
        const onHand = parseNumericValue(row[c]);
        if (!(onHand > 0)) continue;

        const state = extractStateFromDCLabel(c) || String(c || "").trim();
        const normMarket = normalizeCountryCode("AU-C");

        normalized.push({
          Location: state,
          Distributor: distributorName,

          Product: item,
          ProductName: item,
          Code: skuParts.fullSKU || item,

          Brand: skuParts.brand,
          BrandCode: skuParts.brandCode,
          Vintage: skuParts.vintage,
          Variety: skuParts.variety,
          VarietyCode: skuParts.varietyCode || wineTypeCode,

          Market: normMarket,
          MarketCode: skuParts.marketCode,

          OnHand: onHand,
          StockOnHand: onHand,

          AdditionalAttribute2: normMarket,
          AdditionalAttribute3: additionalAttribute3,

          _sheetName: sheetName,
          _dcCol: c,
          _originalData: row,
        });
      }
    }

    return filterEmptyRecords(normalized);
  }

  // ============================================================
  // ✅ Legacy behavior (your previous version) for all other sheets
  // ============================================================

  const productCol = findColumn([
    "Product",
    "Product Description",
    "Product Name",
    "Description",
    "Item",
    "Wine",
    "Wine Name",
    "Product Description (SKU)",
    "SKU Description",
  ]);

  const skuCol = findColumn([
    "SKU",
    "Code",
    "Product Code",
    "Item Code",
    "WW Code",
    "Item",
  ]);

  const countryCol = findColumn([
    "Country",
    "Market",
    "Region",
    "Country Code",
    "AdditionalAttribute2",
    "Market Code",
  ]);

  // Sheet-specific "On Hand" column detection (unchanged from your old version)
  let onHandCol = null;
  let wineTypeCol = null;

  const isNZ = upperSheetName === "NZ" || upperSheetName === "NZL" || sheetName.includes("NZ");
  // Detect pack col only for NZ DSOH
  const packCol = isNZ
    ? detectNZPackCol({
        records,
        headerKeys,
        findColumn,
        productCol,
        skuCol,
        countryCol,
        wineTypeCol,
        onHandCol,
      })
    : null;


  if (isNZ) {
    if (headerKeys.length > 5) {
      wineTypeCol = headerKeys[1];
      onHandCol = headerKeys[4];
    }
  } else if (upperSheetName === "USA" || sheetName.includes("USA")) {
    if (headerKeys.length > 0) {
      wineTypeCol = headerKeys[3];
      onHandCol = headerKeys[4];
    }
  } else if (upperSheetName === "AU-B" || upperSheetName === "AUB" || sheetName.includes("AU-B")) {
    if (headerKeys.length > 0) {
      wineTypeCol = headerKeys[1];
      onHandCol = headerKeys[headerKeys.length - 1];
    }
  } else if (upperSheetName === "IRE" || sheetName.includes("IRE")) {
    if (headerKeys.length > 3) {
      wineTypeCol = headerKeys[2];
      onHandCol = headerKeys[3];
    }
  } else {
    wineTypeCol = findColumn(["Description", "Product"]);
    onHandCol = findColumn([
      "On Hand",
      "Column_5",
      "Stock On Hand",
      "Stock",
      "Quantity",
      "Qty",
      "Current Stock",
      "Qty On Hand",
      "On-Hand",
    ]);
  }

  // Process all records (legacy loop)
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (!row || typeof row !== "object") continue;

    // skip header-like first row (unchanged)
    const rowValues = Object.values(row);
    const nonEmptyValues = rowValues.filter(
      (v) => v !== null && v !== undefined && String(v).trim() !== ""
    );
    if (nonEmptyValues.length > 0) {
      const isHeaderRow = nonEmptyValues.every((v) => {
        const val = String(v || "").toUpperCase().trim();
        return (
          val.includes("DISTRIBUTOR") ||
          val.includes("LOCATION") ||
          val.includes("PRODUCT") ||
          val.includes("SKU") ||
          val.includes("ON HAND") ||
          val.includes("STOCK") ||
          val.includes("QUANTITY") ||
          val.includes("CODE") ||
          val.includes("DESCRIPTION")
        );
      });
      if (isHeaderRow && i === 0) continue;
    }

    const product = productCol ? String(row[productCol] || "").trim() : "";
    const sku = skuCol ? String(row[skuCol] || "").trim() : "";
    const country = countryCol ? String(row[countryCol] || "").trim() : "";

    if (!product && !sku) continue;

    const onHandRaw = onHandCol ? parseNumericValue(row[onHandCol]) : 0;

    let onHand = onHandRaw;

    // ✅ NZ only: convert 6-pack to 12-pack units
    if (isNZ && packCol) {
      const packRaw = row?.[packCol];
      const packNum = parseInt(String(packRaw ?? "").replace(/[^\d]/g, ""), 10);

      if (packNum === 6) onHand = onHandRaw / 2;
      else if (packNum === 12) onHand = onHandRaw;

      // DEBUG sample
      if (i < 20) {
        console.log("[NZ SOH PACK]", {
          i,
          packCol,
          packRaw,
          packNum,
          onHand_raw: onHandRaw,
          onHand_12pk: onHand,
        });
      }
    } else if (isNZ && !packCol && i < 3) {
      console.warn("[NZ SOH PACK] cannot convert (no packCol)", {
        i,
        onHand_raw: onHandRaw,
      });
    }


    const wineType = wineTypeCol ? String(row[wineTypeCol] || "").trim() : "";

    // USA: state from 2nd column index 1 (legacy)
    let state = "";
    if ((upperSheetName === "USA" || sheetName.includes("USA")) && headerKeys.length > 1) {
      state = String(row[headerKeys[1]] || "").trim();
    }

    const skuParts = parseProductSKU(sku || product);

    let wineTypeCode = normalizeWineTypeToCode(wineType || product || sku);
    if (!wineTypeCode || wineTypeCode.length > 10) {
      wineTypeCode = normalizeWineTypeToCode(skuParts.varietyCode || skuParts.fullSKU);
    }

    const wineCode =
      skuParts.fullSKU ||
      (sku ? sku.toUpperCase() : "") ||
      (product ? product.split(" ").slice(0, 3).join("_").toUpperCase() : "");

    let additionalAttribute3 = "";
    if (wineTypeCode && wineTypeCode.length <= 10) {
      additionalAttribute3 = wineTypeCode;
    } else {
      const fallbackWineType = normalizeWineTypeToCode(wineCode || product || sku);
      if (fallbackWineType && fallbackWineType.length <= 10) {
        additionalAttribute3 = fallbackWineType;
      } else {
        additionalAttribute3 =
          wineCode ||
          `${skuParts.brandCode}_${skuParts.varietyCode}_${skuParts.vintageCode}`.toUpperCase();
      }
    }

    let location = distributorName;
    if (state && (upperSheetName === "USA" || sheetName.includes("USA"))) {
      location = `${state}`;
    }

    normalized.push({
      Location: location,
      Distributor: distributorName,

      Product: wineType,
      ProductName: product || (skuParts.brand ? `${skuParts.brand} ${skuParts.variety}`.trim() : ""),
      Code: sku || skuParts.fullSKU,

      Brand: skuParts.brand,
      BrandCode: skuParts.brandCode,
      Vintage: skuParts.vintage,
      Variety: skuParts.variety,
      VarietyCode: skuParts.varietyCode || wineTypeCode,
      Market: normalizeCountryCode(country || sheetName),
      MarketCode: skuParts.marketCode,

      OnHand: onHand,
      StockOnHand: onHand,

      AdditionalAttribute2: normalizeCountryCode(country || sheetName),
      AdditionalAttribute3:
        additionalAttribute3 ||
        `${skuParts.brandCode}_${skuParts.varietyCode}_${skuParts.vintageCode}`.toUpperCase(),

      _sheetName: sheetName,
      _originalData: row,
    });
  }

  return filterEmptyRecords(normalized);
}

// ==================== Monthly Snapshot Storage ====================

export const MONTHS_INDEX_KEY = 'vc_months_index';
export const MONTHLY_DATA_TYPES = ['exports', 'warehouse_stock', 'sales', 'stock_on_hand_distributors'];

export function getMonthsIndex() {
  try {
    return JSON.parse(localStorage.getItem(MONTHS_INDEX_KEY) || '{}');
  } catch { return {}; }
}

export function saveMonthsIndex(index) {
  localStorage.setItem(MONTHS_INDEX_KEY, JSON.stringify(index));
}

export function getMonthDataKey(monthKey, type) {
  return `vc_month_${monthKey}_${type}`;
}

export function getMonthSheetKey(monthKey, type, sheetName) {
  return `vc_month_${monthKey}_${type}_sheet_${sheetName}`;
}

export function getMonthMetaKey(monthKey, type) {
  return `vc_month_${monthKey}_${type}_meta`;
}

export function isMonthComplete(idx, monthKey) {
  const month = idx[monthKey];
  if (!month) return false;
  return MONTHLY_DATA_TYPES.every(type => month[type]?.uploaded);
}

export function isMonthLocked(idx, monthKey) {
  return idx[monthKey]?.locked === true;
}

export function clearMonthTypeData(monthKey, type) {
  const metaRaw = localStorage.getItem(getMonthMetaKey(monthKey, type));
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw);
      if (meta.sheetNames && Array.isArray(meta.sheetNames)) {
        meta.sheetNames.forEach(sn => {
          localStorage.removeItem(getMonthSheetKey(monthKey, type, sn));
        });
      }
    } catch {}
    localStorage.removeItem(getMonthMetaKey(monthKey, type));
  }
  localStorage.removeItem(getMonthDataKey(monthKey, type));
}

export function clearMonthAllData(monthKey) {
  MONTHLY_DATA_TYPES.forEach(type => clearMonthTypeData(monthKey, type));
}

export function loadAllMonthlyData() {
  const index = getMonthsIndex();
  if (!index || Object.keys(index).length === 0) return null;

  const result = {
    exports: [],
    warehouse_stock: [],
    sales: [],
    stock_on_hand_distributors: [],
  };

  for (const [monthKey, monthInfo] of Object.entries(index)) {
    for (const type of MONTHLY_DATA_TYPES) {
      if (!monthInfo[type]?.uploaded) continue;

      let loaded = false;
      const metaRaw = localStorage.getItem(getMonthMetaKey(monthKey, type));
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          if (meta.sheetNames && Array.isArray(meta.sheetNames)) {
            meta.sheetNames.forEach(sn => {
              const sheetRaw = localStorage.getItem(getMonthSheetKey(monthKey, type, sn));
              if (sheetRaw) {
                const parsed = JSON.parse(sheetRaw);
                if (Array.isArray(parsed)) {
                  result[type].push(...parsed.map(r => ({ ...r, _uploadMonth: monthKey, _sheetName: r._sheetName || sn })));
                }
              }
            });
            loaded = true;
          }
        } catch {}
      }

      if (!loaded) {
        const raw = localStorage.getItem(getMonthDataKey(monthKey, type));
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              result[type].push(...parsed.map(r => ({ ...r, _uploadMonth: monthKey })));
            }
          } catch {}
        }
      }
    }
  }

  const hasData = Object.values(result).some(arr => arr.length > 0);
  return hasData ? result : null;
}

export function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
