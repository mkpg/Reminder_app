/**
 * ==============================================================================
 * TN SevaGuard - Google Apps Script Backend for Google Sheets
 * ==============================================================================
 * Instructions:
 * 1. Open your Google Sheet.
 * 2. In the top menu, go to: Extensions > Apps Script.
 * 3. Delete any code in the editor, and paste this entire file.
 * 4. Click the Save icon (💾).
 * 5. Click "Deploy" > "New deployment".
 * 6. Select type: "Web app".
 * 7. Set:
 *    - Description: TN SevaGuard Sync API
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (allows the web app to read and write without login prompts)
 * 8. Click "Deploy", authorize permissions when prompted, and copy the Web App URL.
 * 9. Paste the Web App URL into TN SevaGuard (click the Google Sheets button in the header).
 * ==============================================================================
 */

const SHEET_NAME = 'Sheet1';

// Expected Columns in Row 1 of your Google Sheet:
const EXPECTED_HEADERS = [
  'id',
  'name',
  'category',
  'provider',
  'policyNumber',
  'regionZone',
  'holderName',
  'fatherSpouseName',
  'mobile',
  'expiryDate',
  'premiumAmount',
  'paymentFrequency',
  'reminderDays',
  'portalUrl',
  'notes',
  'lastUpdated'
];

/**
 * Handle GET Requests: Read all due dates and reminders from the Google Sheet
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();

    if (rows.length <= 1) {
      // Empty sheet or only headers
      return createJsonResponse({
        success: true,
        count: 0,
        data: []
      });
    }

    const headers = rows[0].map(h => String(h).trim());
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Skip empty rows where neither name nor policyNumber exists
      if (!row[0] && !row[1] && !row[4]) continue;

      const item = {};
      headers.forEach((h, colIdx) => {
        let val = row[colIdx];
        if (val instanceof Date) {
          // Format date as YYYY-MM-DD
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
        }
        item[h] = val;
      });

      // Ensure proper typing
      if (item.premiumAmount) {
        item.premiumAmount = parseFloat(String(item.premiumAmount).replace(/[^0-9.]/g, '')) || 0;
      }
      if (item.reminderDays) {
        item.reminderDays = parseInt(item.reminderDays, 10) || 7;
      }

      data.push(item);
    }

    return createJsonResponse({
      success: true,
      count: data.length,
      data: data
    });

  } catch (err) {
    return createJsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

/**
 * Handle POST Requests: Add new reminder, update existing reminder, or delete
 */
function doPost(e) {
  try {
    const sheet = getOrCreateSheet();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'add';

    if (action === 'add') {
      const item = payload.data;
      if (!item) throw new Error('No data provided in payload');

      const id = item.id || ('tn_' + Utilities.getUuid().substring(0, 8));
      const newRow = [
        id,
        item.name || '',
        item.category || '',
        item.provider || '',
        item.policyNumber || '',
        item.regionZone || '',
        item.holderName || '',
        item.fatherSpouseName || '',
        item.mobile || '',
        item.expiryDate || '',
        item.premiumAmount || 0,
        item.paymentFrequency || '',
        item.reminderDays || 7,
        item.portalUrl || '',
        item.notes || '',
        new Date().toISOString()
      ];

      sheet.appendRow(newRow);

      return createJsonResponse({
        success: true,
        message: 'Reminder added to Google Sheet successfully',
        id: id
      });
    }

    if (action === 'update') {
      const item = payload.data;
      if (!item || !item.id) throw new Error('Item ID is required for update');

      const rows = sheet.getDataRange().getValues();
      let foundIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(item.id) || (item.policyNumber && String(rows[i][4]) === String(item.policyNumber))) {
          foundIndex = i + 1; // 1-based row index
          break;
        }
      }

      if (foundIndex === -1) {
        // Not found, append as new
        return doPost({ postData: { contents: JSON.stringify({ action: 'add', data: item }) } });
      }

      const updatedRow = [
        item.id,
        item.name || '',
        item.category || '',
        item.provider || '',
        item.policyNumber || '',
        item.regionZone || '',
        item.holderName || '',
        item.fatherSpouseName || '',
        item.mobile || '',
        item.expiryDate || '',
        item.premiumAmount || 0,
        item.paymentFrequency || '',
        item.reminderDays || 7,
        item.portalUrl || '',
        item.notes || '',
        new Date().toISOString()
      ];

      sheet.getRange(foundIndex, 1, 1, updatedRow.length).setValues([updatedRow]);

      return createJsonResponse({
        success: true,
        message: 'Reminder updated in Google Sheet successfully'
      });
    }

    if (action === 'delete') {
      const id = payload.id;
      if (!id) throw new Error('Item ID is required for delete');

      const rows = sheet.getDataRange().getValues();
      let foundIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) {
          foundIndex = i + 1;
          break;
        }
      }

      if (foundIndex !== -1) {
        sheet.deleteRow(foundIndex);
        return createJsonResponse({
          success: true,
          message: 'Reminder deleted from Google Sheet'
        });
      } else {
        return createJsonResponse({
          success: false,
          message: 'Reminder not found in Google Sheet'
        });
      }
    }

    return createJsonResponse({
      success: false,
      error: 'Unsupported action: ' + action
    });

  } catch (err) {
    return createJsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

/**
 * Helper: Find or initialize the sheet with proper column headers
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Ensure headers exist in Row 1
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(EXPECTED_HEADERS);
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Helper: Create JSON HTTP Response
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
