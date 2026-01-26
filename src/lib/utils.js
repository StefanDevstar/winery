import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import Papa from "papaparse";
import * as XLSX from "xlsx";

export function cn(...inputs) {
  return twMerge(clsx(inputs))
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
    return 'RIESLING';
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
export function parseProductSKU(sku) {
  if (!sku || typeof sku !== 'string') {
    return {
      brand: '',
      vintage: '',
      variety: '',
      market: '',
      caseSize: '',
      bottleVolume: '',
      fullSKU: ''
    };
  }
  
  const cleaned = sku.trim();
  const parts = cleaned.split(/\s+/).filter(p => p && p.trim() !== '');
  
  // Remove values like #2 or strip
  const filteredParts = parts.filter(p => !p.match(/^#\d+$/i) && !p.toLowerCase().includes('strip'));
  
  // Brand mapping
  const brandMap = {
    'JT': 'Jules Taylor',
    'TBH': 'The Better Half',
    'BH': 'The Better Half',
    'OTQ': 'On the Quiet'
  };
  
  // Variety mapping
  const varietyMap = {
    'SAB': 'Sauvignon Blanc',
    'CHR': 'Chardonnay',
    'ROSE': 'Rose',
    'PIN': 'Pinot Noir',
    'PIG': 'Pinot Gris',
    'GRU': 'Gruner Veltliner',
    'LHS': 'Late Harvest Sauvignon',
    'RIES': 'RIESLING'

  };
  
  // Find variety by searching filteredParts for variety codes or full wine type names
  const varietyCodes = Object.keys(varietyMap);
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
  const wineTypeNames = Object.keys(wineTypeMap);
  
  let foundVariety = '';
  let foundVarietyIndex = -1;
  
  // First, check for exact matches with variety codes (SAB, PIN, etc.)
  for (let i = 0; i < filteredParts.length; i++) {
    const part = filteredParts[i].toUpperCase();
    // Check if this part matches any variety code
    if (varietyCodes.includes(part)) {
      foundVariety = filteredParts[i];
      foundVarietyIndex = i;
      break;
    }
  }
  
  // If not found, check for full wine type names in single parts (SAUVIGNON BLANC, PINOT NOIR, etc.)
  if (!foundVariety) {
    for (let i = 0; i < filteredParts.length; i++) {
      const part = filteredParts[i].toUpperCase();
      // Check if this part matches any full wine type name
      for (const wineTypeName of wineTypeNames) {
        if (part === wineTypeName || part.includes(wineTypeName) || wineTypeName.includes(part)) {
          // Convert full name to code
          foundVariety = wineTypeMap[wineTypeName];
          foundVarietyIndex = i;
          break;
        }
      }
      if (foundVariety) break;
    }
  }
  
  // Also check for full wine type names split across multiple parts (e.g., "SAUVIGNON BLANC" might be split)
  if (!foundVariety && filteredParts.length > 1) {
    // Check two consecutive parts
    for (let i = 0; i < filteredParts.length - 1; i++) {
      const combined = `${filteredParts[i]} ${filteredParts[i + 1]}`.toUpperCase();
      for (const wineTypeName of wineTypeNames) {
        if (combined === wineTypeName || combined.includes(wineTypeName) || wineTypeName.includes(combined)) {
          foundVariety = wineTypeMap[wineTypeName];
          foundVarietyIndex = i;
          break;
        }
      }
      if (foundVariety) break;
    }
    
    // Check three consecutive parts (for "LATE HARVEST SAUVIGNON")
    if (!foundVariety && filteredParts.length > 2) {
      for (let i = 0; i < filteredParts.length - 2; i++) {
        const combined = `${filteredParts[i]} ${filteredParts[i + 1]} ${filteredParts[i + 2]}`.toUpperCase();
        for (const wineTypeName of wineTypeNames) {
          if (combined === wineTypeName || combined.includes(wineTypeName) || wineTypeName.includes(combined)) {
            foundVariety = wineTypeMap[wineTypeName];
            foundVarietyIndex = i;
            break;
          }
        }
        if (foundVariety) break;
      }
    }
  }
  
  // If still not found, try to find by checking if part contains variety code
  if (!foundVariety) {
    for (let i = 0; i < filteredParts.length; i++) {
      const part = filteredParts[i].toUpperCase();
      for (const code of varietyCodes) {
        if (part.includes(code) || code.includes(part)) {
          foundVariety = filteredParts[i];
          foundVarietyIndex = i;
          break;
        }
      }
      if (foundVariety) break;
    }
  }
  
  if (filteredParts.length < 4) {
    // Not enough parts, return what we have (using found variety if available)
    return {
      brand: filteredParts[0] || '',
      vintage: filteredParts[1] || '',
      variety: foundVariety || '',
      market: filteredParts[3] || '',
      caseSize: filteredParts[4] || '',
      bottleVolume: filteredParts[5] || '',
      fullSKU: cleaned
    };
  }
  
  // Case size mapping
  const caseSizeMap = {
    '6PCK': '6 pack',
    '12PCK': '12 pack',
    'SINGLE': 'Single'
  };
  
  // Bottle volume mapping
  const bottleVolumeMap = {
    '1500': 'Magnum',
    '375': 'Demi',
    '750': 'Regular',
    '750ML': 'Regular'
  };
  
  // Use the variety we found earlier (or fallback to filteredParts[2])
  const variety = foundVariety || '';
  const varietyIndex = foundVarietyIndex >= 0 ? foundVarietyIndex : 2;
  
  // Assign other parts based on variety position
  // Brand is typically first (index 0)
  const brand = filteredParts[0] || '';
  
  // Vintage is typically second (index 1), but could be different if variety is at index 1
  let vintage = '';
  if (varietyIndex === 1) {
    // If variety is at index 1, vintage might be at index 0 or 2
    vintage = filteredParts[0] && /^\d{2}$/.test(filteredParts[0]) ? filteredParts[0] : (filteredParts[2] || '');
  } else {
    vintage = filteredParts[1] || '';
  }
  
  // Market is typically after variety
  let market = '';
  if (varietyIndex >= 0 && varietyIndex < filteredParts.length - 1) {
    market = filteredParts[varietyIndex + 1] || '';
  } else {
    market = filteredParts[3] || '';
  }
  
  // Case size and bottle volume are typically at the end
  const caseSize = filteredParts[filteredParts.length - 2] || filteredParts[4] || '';
  const bottleVolume = filteredParts[filteredParts.length - 1] || filteredParts[5] || '';
  
  // Handle market codes that appear twice (use second one)
  let finalMarket = market;
  if (filteredParts.length > 4) {
    // Check if there's a second market code
    const potentialSecondMarket = filteredParts.slice(4).find(p => 
      ['KO', 'ROW', 'GR', 'UK', 'C/S', 'PHI', 'UEA', 'SG', 'TAI', 'POL', 'HK', 'MAL', 'CA', 'NE', 'TH', 'DE', 'US', 'JPN', 'AU/B', 'AU/C', 'IRE', 'NZ', 'NZL'].includes(p.toUpperCase())
    );
    if (potentialSecondMarket) {
      finalMarket = potentialSecondMarket;
    }
  }
  
  // Convert vintage to full year
  let fullVintage = vintage;
  if (vintage && /^\d{2}$/.test(vintage)) {
    const year = parseInt(vintage);
    fullVintage = year >= 50 ? `19${vintage}` : `20${vintage}`;
  }
  
  return {
    brand: brandMap[brand.toUpperCase()] || brand,
    brandCode: brand,
    vintage: fullVintage,
    vintageCode: vintage,
    variety: varietyMap[variety.toUpperCase()] || variety,
    varietyCode: variety,
    market: normalizeCountryCode(finalMarket),
    marketCode: finalMarket,
    caseSize: caseSizeMap[caseSize.toUpperCase()] || caseSize,
    caseSizeCode: caseSize,
    bottleVolume: bottleVolumeMap[bottleVolume.toUpperCase()] || (bottleVolume ? `${bottleVolume}ml` : 'Regular'),
    bottleVolumeCode: bottleVolume || '750',
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
function parseAUBSheet(records) {
  // First filter out completely empty records
  const filteredRecords = records.filter(r => {
    if (!r || typeof r !== 'object') return false;
    return Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== '');
  });
  
  return filteredRecords
    .filter(r => r['Wine Name'] && r['Quantity - Cartons'])
    .map(r => {
      const wineName = String(r['Wine Name'] || '').trim();
      const quantity = parseFloat(String(r['Quantity - Cartons'] || '0').replace(/,/g, '')) || 0;
      const customer = String(r['Customer/Project'] || '').trim();
      const state = String(r.State || '').trim();
      const month = String(r.Month || '').trim();
      const year = String(r.Year || '').trim();
      
      // Extract brand/variety from wine name
      const parts = wineName.split(/\s+/);
      const brand = parts[0] || '';
      const variety = parts.slice(1).join(' ') || '';
      
      return {
        AdditionalAttribute2: 'au-b', // Preserve AU-B as separate country code
        AdditionalAttribute3: normalizeWineTypeToCode(variety || wineName), // Wine code (SAB, PIN, etc.)
        ProductName: wineName, // Product name
        Location: state ? `${state}_${customer}`.substring(0, 50) : customer.substring(0, 50), // Location (State_Customer)
        Available: quantity, // Quantity sold (depletion)
        _month: month,
        _year: year,
        _customer: customer,
        _sheetName: 'AU-B'
      };
    })
    .filter(record => !isEmptyRecord(record)); // Filter empty records
}

/**
 * Parses AU-C sheet - Sales by Banner and Item
 * Structure: Banner, Item, Sales Qty (Singles)
 */
function parseAUCSheet(records) {
  // First filter out completely empty records
  const filteredRecords = records.filter(r => {
    if (!r || typeof r !== 'object') return false;
    return Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== '');
  });
  
  return filteredRecords
    .filter(r => r.Banner && r.Item && r['Sales Qty (Singles)'])
    .map(r => {
      const banner = String(r.Banner || '').trim();
      // Get the third column value (index 2, 0-based)
      const columnKeys = Object.keys(r);
      const thirdColumnKey = columnKeys.length > 2 ? columnKeys[2] : null;
      const thirdColumnValue = thirdColumnKey ? String(r[thirdColumnKey] || '').trim() : '';
      const salesQty = parseFloat(String(r['Sales Qty (Singles)'] || '0').replace(/,/g, '')) || 0;
      
      return {
        AdditionalAttribute2: 'au-c', // Preserve AU-C as separate country code
        AdditionalAttribute3: normalizeWineTypeToCode(thirdColumnValue), // Wine code (SAB, PIN, etc.)
        ProductName: `Item ${thirdColumnValue}`, // Product name
        Location: banner.toUpperCase(), // Location (Banner)
        Available: salesQty, // Sales quantity (depletion)
        _banner: banner,
        _sheetName: 'AU-C'
      };
    })
    .filter(record => !isEmptyRecord(record)); // Filter empty records
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

/**
 * Normalizes exports data from Excel file.
 * Expected output format: { Stock: wineCode, cases: quantity, Company: company, ... }
 * 
 * @param {Array} records - Array of records from a sheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Array} - Normalized records with Stock and cases fields
 */
export function normalizeExportsData(records, sheetName = '') {
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
    const customerCol = findColumn(['Company', 'Customer', 'Distributor']);
    const casesCol = findColumn(['Cases', 'Quantity', 'Qty', 'Cartons', 'Units']);
    const statusCol = findColumn(['Status', 'Order Status', 'Shipment Status']);
    const dateShippedCol = findColumn(['Shipped from WWM', 'Date Shipped', 'Shipped Date', 'Shipped from', 'Shipped']);
    const dateArrivalCol = findColumn([
      'Export Entry sent to WWM',
      'Export Entry',
      'Date of Arrival', 
      'Arrival Date', 
      'Arrived Date', 
      'Received Date', 
      'Date Arrival',
      'Export Entry sent',
      'Entry sent to WWM',
      'Entry sent',
      'WWM Entry',
      'Entry Sent to WWM'
    ]);
    const freightForwarderCol = findColumn(['Freight Forwarder', 'Freight', 'Forwarder', 'Carrier', 'Shipping Company']);

    // Process data rows
    for (let i = headerRowIndex + 1; i < records.length; i++) {
      const row = records[i];
      if (!row || typeof row !== 'object') continue;
      
      const productDesc = productDescCol ? String(row[productDescCol] || '').trim() : '';
      const customer = customerCol ? String(row[customerCol] || '').trim() : '';
      const cases = casesCol ? parseFloat(String(row[casesCol] || '0').replace(/,/g, '')) : 0;
      const status = statusCol ? String(row[statusCol] || '').trim().toLowerCase() : '';
      
      // Get date values - handle both key-based and value-based column access
      let dateShipped = '';
      if (dateShippedCol) {
        // Try accessing by the key directly first
        dateShipped = String(row[dateShippedCol] || '').trim();
        // If empty, try accessing by header value (in case headers are used as keys)
        if (!dateShipped && headers[dateShippedCol]) {
          const headerVal = String(headers[dateShippedCol] || '').trim();
          dateShipped = String(row[headerVal] || '').trim();
        }
      }
      
      let dateArrival = '';
      if (dateArrivalCol) {
        // Try accessing by the key directly first
        dateArrival = String(row[dateArrivalCol] || '').trim();
        // If empty, try accessing by header value (in case headers are used as keys)
        if (!dateArrival && headers[dateArrivalCol]) {
          const headerVal = String(headers[dateArrivalCol] || '').trim();
          dateArrival = String(row[headerVal] || '').trim();
        }
        // Additional fallback: search for any column with matching header text
        if (!dateArrival) {
          for (const [key, val] of Object.entries(headers)) {
            const headerText = String(val || '').toUpperCase().trim();
            if (headerText.includes('EXPORT ENTRY') && headerText.includes('WWM')) {
              dateArrival = String(row[key] || '').trim();
              if (dateArrival) break;
            }
          }
        }
      }
      
      const freightForwarder = freightForwarderCol ? String(row[freightForwarderCol] || '').trim() : '';
      
      if (!productDesc || cases <= 0) continue;
      
      // Parse Product Description (SKU) - same format as stock on hand
      const skuParts = parseProductSKU(productDesc);
      
      // Helper function to parse dates from various Excel formats
      const parseDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        
        const cleaned = dateStr.trim();
        if (!cleaned) return null;
        
        // Try standard Date parsing first
        let date = new Date(cleaned);
        if (!isNaN(date.getTime())) {
          return date;
        }
        
        // Try parsing formats like "2/10/25", "2/10/2025", "10/2/25", "10/2/2025"
        const parts = cleaned.split(/[\/\-]/);
        if (parts.length >= 3) {
          let month, day, year;
          
          // Determine format: US format (M/D/Y) vs ISO (Y-M-D)
          if (parts[0].length === 4) {
            // ISO format: YYYY-MM-DD
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1; // Month is 0-indexed
            day = parseInt(parts[2]);
          } else {
            // US format: M/D/Y or D/M/Y (try both)
            const first = parseInt(parts[0]);
            const second = parseInt(parts[1]);
            const third = parseInt(parts[2]);
            
            // If first part > 12, it's likely D/M/Y format
            if (first > 12 && second <= 12) {
              day = first;
              month = second - 1;
              year = third;
            } else {
              // Assume M/D/Y format
              month = first - 1;
              day = second;
              year = third;
            }
            
            // Handle 2-digit years
            if (year < 100) {
              year = year >= 50 ? 1900 + year : 2000 + year;
            }
          }
          
          date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
        
        return null;
      };
      
      // Parse dates
      const shippedDate = dateShipped ? parseDate(dateShipped) : null;
      const arrivalDate = dateArrival ? parseDate(dateArrival) : null;
      
      // Calculate shipping time in days
      let shippingDays = null;
      let daysInTransit = null;
      
      if (shippedDate && arrivalDate) {
        // Both dates available: calculate total shipping days
        shippingDays = Math.ceil((arrivalDate - shippedDate) / (1000 * 60 * 60 * 24));
      } else if (shippedDate) {
        // Only shipped date available: calculate days since shipped (currently in transit)
        const now = new Date();
        daysInTransit = Math.ceil((now - shippedDate) / (1000 * 60 * 60 * 24));
        // Use daysInTransit as shippingDays for items currently in transit
        shippingDays = daysInTransit;
      }
      
      // Get country code from company name using the mapping
      // Fallback to "nzl" if no match found (default for exports from New Zealand)
      const countryCode = getCountryFromCompany(customer) || "nzl";
      
      normalized.push({
        // Product information
        Stock: productDesc,
        ProductDescription: productDesc,
        ProductName: skuParts.brand ? `${skuParts.brand} ${skuParts.variety}`.trim() : '',
        
        // SKU components
        Brand: skuParts.brand,
        BrandCode: skuParts.brandCode,
        Vintage: skuParts.vintage,
        Variety: skuParts.variety,
        VarietyCode: skuParts.varietyCode,
        Market: skuParts.market, // Normalized country code
        MarketCode: skuParts.marketCode,
        
        // Order information
        Customer: customer || sheetName,
        Company: customer || sheetName, // For backward compatibility
        cases: cases,
        Status: status,
        
        // Dates and shipping
        DateShipped: dateShipped,
        DateArrival: dateArrival,
        ShippingDays: shippingDays,
        DaysInTransit: daysInTransit, // Days since shipped (for items currently in transit)
        FreightForwarder: freightForwarder,
        
        // For Dashboard compatibility
        AdditionalAttribute2: countryCode, // Normalized country code from company mapping
        AdditionalAttribute3: `${skuParts.vintage}`.toUpperCase(),
        
        _sheetName: sheetName,
        _originalData: row
      });
    }
  }
  
  // Filter out empty records before returning
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
export function normalizeDistributorStockOnHandData(records, sheetName = '') {
  if (!Array.isArray(records) || records.length === 0) return [];
  
  const normalized = [];
  
  // Records from parseExcel are already objects with header keys
  // Each sheet represents a distributor, so use sheetName as the distributor name
  const distributorName = sheetName || 'Unknown';
  // Find the first non-empty record to get header keys
  let firstRecord = null;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record && typeof record === 'object' && Object.keys(record).length > 0) {
      firstRecord = record;
      break;
    }
  }
  
  if (!firstRecord) return [];
  
  const headerKeys = Object.keys(firstRecord);
  
  
  // Find column keys by matching header names (case-insensitive, handles spaces/variations)
  const findColumn = (searchTerms) => {
    for (const term of searchTerms) {
      const key = headerKeys.find(k => {
        const headerVal = String(k || '').toUpperCase().trim();
        const termUpper = term.toUpperCase();
        // Exact match
        if (headerVal === termUpper) return true;
        // Contains match
        if (headerVal.includes(termUpper) || termUpper.includes(headerVal)) return true;
        // Match without spaces
        if (headerVal.replace(/\s+/g, '') === termUpper.replace(/\s+/g, '')) return true;
        // Match with underscores
        if (headerVal.replace(/_/g, ' ') === termUpper || termUpper.replace(/_/g, ' ') === headerVal) return true;
        return false;
      });
      if (key !== undefined) {
        return key;
      }
    }
    return null;
  };
  
  // Find key columns - try multiple variations and common Excel column names
  const productCol = findColumn(['Product', 'Product Description', 'Product Name', 'Description', 'Item', 'Wine', 'Wine Name', 'Product Description (SKU)', 'SKU Description']);
  const skuCol = findColumn(['SKU', 'Code', 'Product Code', 'Item Code', 'WW Code', 'Product Code', 'Item', 'WW Code', 'Code']);
  
  // Sheet-specific "On Hand" column detection
  // NZ sheet: Column 6 (index 5)
  // USA sheet: Last column
  // AU-B sheet: Last column
  // IRE sheet: 4th column (index 3)
  const upperSheetName = sheetName.toUpperCase();
  let onHandCol = null;
  let wineTypeCol = null;
  
  if (upperSheetName === 'NZ' || upperSheetName === 'NZL' || sheetName.includes('NZ')) {
    // NZL sheet: Column 6 (index 5, 0-based)
    if (headerKeys.length > 5) {
      wineTypeCol = headerKeys[1];
      onHandCol = headerKeys[4];
    }
  } else if (upperSheetName === 'USA' || sheetName.includes('USA')) {
    // USA sheet: Last column for On Hand, second column (index 1) is State
    if (headerKeys.length > 0) {
      wineTypeCol = headerKeys[3];
      onHandCol = headerKeys[4];
    }
  } else if (upperSheetName === 'AU-B' || upperSheetName === 'AUB' || sheetName.includes('AU-B')) {
    // AU-B sheet: Last column
    if (headerKeys.length > 0) {
      wineTypeCol = headerKeys[1];
      onHandCol = headerKeys[headerKeys.length - 1];
    }
  } else if (upperSheetName === 'IRE' || sheetName.includes('IRE')) {
    // IRE sheet: 4th column (index 3)
    if (headerKeys.length > 3) {
      wineTypeCol = headerKeys[2];
      onHandCol = headerKeys[3];
    }
  } else {
    wineTypeCol = findColumn(['Description', 'Product']);
    // For other sheets, try to find by name
    onHandCol = findColumn(['On Hand', 'Column_5', 'Stock On Hand', 'Stock', 'Quantity', 'Qty', 'Current Stock', 'Stock On Hand', 'On Hand', 'Qty On Hand', 'On-Hand']);
  }
  
  const countryCol = findColumn(['Country', 'Market', 'Region', 'Country Code', 'AdditionalAttribute2', 'Market Code']);
  
  if (!onHandCol) {
    // Could not find "On Hand" column - will use fallback logic
  }
  
  // Helper function to parse numeric values, handling currency symbols and formatting
  const parseNumericValue = (value) => {
    if (value === undefined || value === null || value === '') return 0;
    const cleaned = String(value)
      .replace(/[$€£¥,]/g, '') // Remove currency symbols and commas
      .replace(/[^\d.-]/g, '') // Remove any remaining non-numeric except decimal and minus
      .trim();
    const parsed = cleaned !== '' && !isNaN(cleaned) ? parseFloat(cleaned) : 0;
    return parsed;
  };
  
  // Process all records (they're already objects with header keys)
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (!row || typeof row !== 'object') continue;
    
    // Skip if this looks like a header row (check if all values are header-like strings)
    const rowValues = Object.values(row);
    const nonEmptyValues = rowValues.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmptyValues.length > 0) {
      const isHeaderRow = nonEmptyValues.every(v => {
        const val = String(v || '').toUpperCase().trim();
        return val.includes('DISTRIBUTOR') || 
               val.includes('LOCATION') ||
               val.includes('PRODUCT') || 
               val.includes('SKU') ||
               val.includes('ON HAND') ||
               val.includes('STOCK') ||
               val.includes('QUANTITY') ||
               val.includes('CODE') ||
               val.includes('DESCRIPTION');
      });
      if (isHeaderRow && i === 0) {
        continue; // Skip first row if it's a header
      }
    }
    
    // Get product information
    const product = productCol ? String(row[productCol] || '').trim() : '';
    const sku = skuCol ? String(row[skuCol] || '').trim() : '';
    const country = countryCol ? String(row[countryCol] || '').trim() : '';
    
    // Skip rows without product/SKU information
    if (!product && !sku) continue;
    
    // Get stock on hand - this is the critical field
    const onHand = onHandCol ? parseNumericValue(row[onHandCol]) : 0;
    const wineType = wineTypeCol ? String(row[wineTypeCol] || '').trim() : '';
    
    // For USA data, get state from second column (index 1)
    let state = '';
    if ((upperSheetName === 'USA' || sheetName.includes('USA')) && headerKeys.length > 1) {
      state = String(row[headerKeys[1]] || '').trim();
    }
  
    // Parse SKU to extract components
    const skuParts = parseProductSKU(sku || product);
    
    // Extract wine type code from wineType field using normalizeWineTypeToCode
    // This handles variations like "SAUVIGNON BLANC", "JULES TAYLOR SAUVIGNON BLANC", etc.
    let wineTypeCode = normalizeWineTypeToCode(wineType || product || sku);
    
    // If not found from wineType field, try to extract from variety code in skuParts
    if (!wineTypeCode || wineTypeCode.length > 10) {
      wineTypeCode = normalizeWineTypeToCode(skuParts.varietyCode || skuParts.fullSKU);
    }
    
    // Extract wine code from SKU or product
    const wineCode = skuParts.fullSKU || 
                    (sku ? sku.toUpperCase() : '') ||
                    (product ? product.split(' ').slice(0, 3).join('_').toUpperCase() : '');
    
    // Build AdditionalAttribute3 with ONLY wine type code (no prefix)
    // Format: Just the wine type code (SAB, PIN, ROS, PIG, etc.)
    let additionalAttribute3 = '';
    if (wineTypeCode && wineTypeCode.length <= 10) { // Only use if it's a valid wine code (not full text)
      additionalAttribute3 = wineTypeCode;
    } else {
      // Fallback: try to extract wine type from wineCode or product
      const fallbackWineType = normalizeWineTypeToCode(wineCode || product || sku);
      if (fallbackWineType && fallbackWineType.length <= 10) {
        additionalAttribute3 = fallbackWineType;
      } else {
        // Last fallback: use existing wine code if no wine type code found
        additionalAttribute3 = wineCode || `${skuParts.brandCode}_${skuParts.varietyCode}_${skuParts.vintageCode}`.toUpperCase();
      }
    }
    
    // Build location string - for USA, include state if available
    let location = distributorName;
    if (state && (upperSheetName === 'USA' || sheetName.includes('USA'))) {
      location = `${state}`;
    }
    
    normalized.push({
      // Distributor information - use sheet name as distributor, include state for USA
      Location: location,
      Distributor: distributorName,
      
      // Product information
      Product: wineType,
      ProductName: product || (skuParts.brand ? `${skuParts.brand} ${skuParts.variety}`.trim() : ''),
      Code: sku || skuParts.fullSKU,
      
      // SKU components
      Brand: skuParts.brand,
      BrandCode: skuParts.brandCode,
      Vintage: skuParts.vintage,
      Variety: skuParts.variety,
      VarietyCode: skuParts.varietyCode || wineTypeCode, // Use extracted wine type code
      Market: normalizeCountryCode(country || sheetName), // Normalized country code
      MarketCode: skuParts.marketCode,
      
      // Stock information
      OnHand: onHand, // Stock on hand at distributor
      StockOnHand: onHand, // Alias for compatibility
      
      // Additional fields for Dashboard compatibility
      AdditionalAttribute2: normalizeCountryCode(country || sheetName), // Normalized country code
      AdditionalAttribute3: additionalAttribute3 || `${skuParts.brandCode}_${skuParts.varietyCode}_${skuParts.vintageCode}`.toUpperCase(),
      
      _sheetName: sheetName,
      _originalData: row
    });
  }
  
  
  // Filter out empty records before returning
  return filterEmptyRecords(normalized);
}