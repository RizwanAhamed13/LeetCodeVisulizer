/**
 * Google Apps Script for LeetCode Visualizer Spaced Repetition System (SRS).
 * 
 * 1. Create a new Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code and save.
 * 4. Run the "setupSheet" function once to create the columns.
 * 5. Click "Deploy" > "New deployment" > Select type "Web app".
 * 6. Set "Who has access" to "Anyone".
 * 7. Copy the Web App URL and paste it into your index.html dashboard.
 */

const SHEET_NAME = 'Submissions';

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  
  // Set headers
  sheet.getRange(1, 1, 1, 7).setValues([['Username', 'ProblemSlug', 'Title', 'Level', 'NextDueDate', 'LastSolved', 'LastUpdated']]);
  sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function doGet(e) {
  const username = e.parameter.username;
  
  if (!username) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing username parameter" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not set up" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const response = { username: username, problems: {} };

  // Ensure index matches headers (['Username', 'ProblemSlug', 'Title', 'Level', 'NextDueDate', 'LastSolved'])
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0].toString().toLowerCase() === username.toLowerCase()) {
      const slug = row[1];
      response.problems[slug] = {
        title: row[2],
        level: parseInt(row[3], 10) || 0,
        nextDueDate: row[4],
        lastSolved: row[5]
      };
    }
  }

  return ContentService.createTextOutput(JSON.stringify(response))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // We expect JSON payload
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid JSON payload" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  const { username, action, payloadData } = payload;
  
  if (!username) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing username" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (action === 'sync_multiple') {
    // payloadData is an array of problems [{slug, title, level, nextDueDate, lastSolved}]
    const existingData = sheet.getDataRange().getValues();
    const existingMap = {}; // Row Index by slug for this user
    
    // Find existing rows to avoid duplicates
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][0].toString().toLowerCase() === username.toLowerCase()) {
        existingMap[existingData[i][1]] = i + 1; // +1 because rows are 1-indexed
      }
    }

    payloadData.forEach(prob => {
       const rowData = [
         username, 
         prob.slug, 
         prob.title, 
         prob.level, 
         prob.nextDueDate, 
         prob.lastSolved, 
         new Date().toISOString()
       ];
       
       if (existingMap[prob.slug]) {
          // Update existing row (this shouldn't happen often in sync unless overwritten, we only sync accepted)
          // sheet.getRange(existingMap[prob.slug], 1, 1, 7).setValues([rowData]);
       } else {
          // Append new row
          sheet.appendRow(rowData);
       }
    });

    return ContentService.createTextOutput(JSON.stringify({ success: `Synced ${payloadData.length} problems` }))
                         .setMimeType(ContentService.MimeType.JSON);
  } 
  
  else if (action === 'update_revision') {
    // payloadData is { slug, level, nextDueDate }
    const existingData = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][0].toString().toLowerCase() === username.toLowerCase() && 
          existingData[i][1] === payloadData.slug) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > -1) {
      // Update Level and NextDueDate (Columns D and E, which are 4 and 5)
      sheet.getRange(rowIndex, 4).setValue(payloadData.level);
      sheet.getRange(rowIndex, 5).setValue(payloadData.nextDueDate);
      sheet.getRange(rowIndex, 7).setValue(new Date().toISOString()); // Last Updated
      
      return ContentService.createTextOutput(JSON.stringify({ success: "Updated revision level" }))
                           .setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ error: "Problem not found for user" }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
  }

  else if (action === 'add_manual') {
    // Check if it exists first
    const existingData = sheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][0].toString().toLowerCase() === username.toLowerCase() && 
          existingData[i][1] === payloadData.slug) {
         return ContentService.createTextOutput(JSON.stringify({ error: "Problem already exists!" }))
                           .setMimeType(ContentService.MimeType.JSON);
      }
    }

    const rowData = [
      username, 
      payloadData.slug, 
      payloadData.title, 
      0, 
      payloadData.nextDueDate, 
      payloadData.lastSolved, 
      new Date().toISOString()
    ];
    sheet.appendRow(rowData);

    return ContentService.createTextOutput(JSON.stringify({ success: "Added manual problem" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ error: "Unknown action" }))
                       .setMimeType(ContentService.MimeType.JSON);
}
