# Google Sheets Two-Way Integration Guide (TN SevaGuard)

This guide shows you how to connect **Google Sheets** with **TN SevaGuard** so that:
1. **Dues & Reminders in Google Sheets** automatically show up on the website with **Urgent Red Banners, Countdown Badges, and Glowing Cards**.
2. **New Reminders added in the Website** are automatically saved as new rows into your **Google Sheet**.
3. **Marking a Bill as Paid in the Website** automatically updates the next due date inside your **Google Sheet**.
4. **No external emails or SMS** — all alerts are rendered visually on screen inside the app.

---

## Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.new) in your browser.
2. Name your spreadsheet (e.g. `TN SevaGuard Bills & Dues`).
3. Set Row 1 with the following headers (or import `sample_dues_template.csv`):

| id | name | category | provider | policyNumber | regionZone | holderName | fatherSpouseName | mobile | expiryDate | premiumAmount | paymentFrequency | reminderDays | portalUrl | notes | lastUpdated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

> **Tip:** You can paste your existing Excel data directly into these columns. `expiryDate` should be in `YYYY-MM-DD` format (e.g. `2026-10-15`).

---

## Step 2: Add the Google Apps Script Bridge
1. In your Google Sheet, click **Extensions** in the top menu and select **Apps Script**.
2. Erase any default code in `Code.gs`.
3. In the TN SevaGuard app's Google Sheets modal, click **"Download Apps Script (.js)"** or **"Copy Script to Clipboard"**.
4. Paste the entire code into the Apps Script editor.
5. Click the **Save** icon (💾) or press `Ctrl + S`.

---

## Step 3: Deploy as a Web App (1 Minute)
1. In the top right corner of the Apps Script window, click the blue **Deploy** button and choose **New deployment**.
2. Click the gear icon (⚙️) next to "Select type" and select **Web app**.
3. Configure the settings:
   - **Description**: `TN SevaGuard Sync API`
   - **Execute as**: `Me (your-email@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial: allows your website to fetch rows and post new reminders without requiring Google OAuth popups)*
4. Click **Deploy**.
5. Click **Authorize access**, choose your Google account, click *Advanced > Go to Untitled project (unsafe)*, and click **Allow**.
6. **Copy the Web App URL** (it looks like `https://script.google.com/macros/s/AKfycbx.../exec`).

---

## Step 4: Connect to TN SevaGuard Website
1. Open the TN SevaGuard web application.
2. In the top header bar, click the **Google Sheets** button (`<i class="fa-solid fa-table"></i>`).
3. Paste your Web App URL into the **Google Apps Script Web App URL** input.
4. Click **"Test & Connect Google Sheet"**.
5. The status badge will turn green (**Connected**).

---

## How It Operates

### 1. Viewing Reminders
Whenever you open or refresh the TN SevaGuard website, it automatically loads all rows from your Google Sheet. It computes the days remaining from today and displays:
- **Red Urgent Banner** at the top if any due date is ≤ 7 days away.
- **Glowing Red / Amber Cards** matching your deadlines.
- **Countdown pills** (`6 Days Left`, `Due Today`, `Overdue`).

### 2. Adding a Reminder
When you fill out the **"+ Add Reminder"** form on the website and click Save:
- The reminder appears immediately on your screen.
- In the background, it creates a new row in your Google Sheet with the details.

### 3. Typing Directly in Google Sheets
If you or anyone on your team types a new bill or updates an amount directly in Google Sheets:
- Simply click the **"Sync Now"** button in TN SevaGuard (or refresh the page).
- The website immediately updates all cards, countdowns, and KPI metrics.
